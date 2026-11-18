// A copy of the app made for others carries nothing of ours, says where it came from, and the rules are the shared ones (docs/DELIVERY.md, board T740).
// The scan is the shared engine (tools/delivery-tooling, vendored and pinned in vendor.lock.json), Brand's rules (tests/neutrality-rules.json, a pinned copy), and this application's own exceptions
// (neutrality-exceptions.json). The engine's own controls for every rule are in its package; what is tested here is what is PLC's: both targets a person can download are built and scanned
// as built and as release zips, the attribution block is there, every exception is used, and a few controls show that this application's wiring really catches a leak.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {plcScan, format, RULES_FILE, EXCEPTIONS_FILE, BRAND_HASHES_FILE, inventoryHosts} from '../scripts/delivery-scan.mjs';
import {loadRules} from '../tools/delivery-tooling/scan/neutrality.mjs';
import {packageRelease, folderName} from '../scripts/package-release.mjs';

const TARGETS = ['app', 'runkit'];
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
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// The release zips of scripts/package-release.mjs, unpacked: the build inside app/ and the files beside it (the server, README.md, SOURCE.txt with the attribution block, the licence documents).
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
let zipRoots = null;
async function unpackedZips() {
  zipRoots ||= (async () => {
    const roots = [];
    for (const target of TARGETS) {
      const zip = await packageRelease({target, version: '0.64.0', commit: HEAD, outDir: path.join(scratch, 'zips')});
      const dir = path.join(scratch, 'unzipped-' + target);
      mkdirSync(dir);
      execFileSync('unzip', ['-q', zip, '-d', dir]);
      const folder = path.join(dir, folderName('0.64.0', target));
      roots.push(path.join(folder, 'app'), folder);
    }
    return roots;
  })();
  return zipRoots;
}

const built = {};
const problemsOf = (result) => result.problems.join('\n');

// ---- the real outputs ---------------------------------------------------------------------------------------------------------------------------------
for (const target of TARGETS) {
  test(`the ${target} output carries nothing of ours and says where it came from`, async () => {
    built[target] = build(target);
    // one scan per target: an exception that only the other target or a zip uses is checked together below
    const result = await plcScan({roots: [built[target]], hostCheck: false});
    assert.ok(result.files > 100, `only ${result.files} files were scanned`);
    const unexplained = result.problems.filter((p) => !/matches nothing that was scanned/.test(p));
    assert.deepEqual(unexplained, [], 'These are not covered by neutrality-exceptions.json. Remove them from the app, or list them there with a reason:\n' + unexplained.join('\n'));
    const notice = readFileSync(path.join(built[target], 'NOTICE.md'), 'utf8');
    assert.match(notice, /^# Private Local Chat \S+\nfrom ai of our own\nBuilt from commit [0-9a-f]{40}\nLicence: AGPL-3.0-only\nSource: https:\/\/forge\.aiofourown\.com\/programme\/privatelocalchat\n/, notice);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(path.join(built[target], 'attribution.json'), 'utf8'))).sort(), ['commit', 'licence', 'name', 'source', 'version']);
    assert.ok(existsSync(path.join(built[target], 'LICENSE')));
  });
}

test('the neutral pages carry the attribution block, and the app target has no pages', async () => {
  for (const page of ['about', 'help']) {
    const html = readFileSync(path.join(built.runkit || build('runkit'), page, 'index.html'), 'utf8');
    assert.match(html, /<!--attribution--><p class="attribution">Private Local Chat \S+ &middot; from ai of our own<br>Built from commit [0-9a-f]{40}/, page);
  }
  assert.ok(!existsSync(path.join(built.app || build('app'), 'about')));
});

test('the release zips carry nothing of ours, and every exception and allowed host is used by something scanned', async () => {
  const zipFolders = await unpackedZips();
  const roots = [built.app || build('app'), built.runkit || build('runkit'), ...zipFolders];
  const result = await plcScan({roots, skipPaths: ['app/**']});
  assert.deepEqual(result.problems, [], 'the exceptions, the hosts or the attribution of the outputs and the zips:\n' + problemsOf(result));
  assert.ok(result.files > 400 && result.until.length === 0, 'no exception of this application is temporary: ' + result.until.join('|'));
  const text = format(result);
  assert.match(text, /rules neutrality-rules\/1 version 0\.3\.\d+/, 'the run prints the rule file version');
});

test('the zip root says where the download came from: SOURCE.txt starts with the block and attribution.json sits beside it', async () => {
  const folder = (await unpackedZips()).find((r) => !r.endsWith('/app'));
  const source = readFileSync(path.join(folder, 'SOURCE.txt'), 'utf8'), notice = readFileSync(path.join(folder, 'app', 'NOTICE.md'), 'utf8');
  assert.ok(source.startsWith(notice), 'SOURCE.txt starts with the very same block as the build\'s NOTICE.md');
  assert.deepEqual(JSON.parse(readFileSync(path.join(folder, 'attribution.json'), 'utf8')), JSON.parse(readFileSync(path.join(folder, 'app', 'attribution.json'), 'utf8')));
});

// ---- the pinned inputs ---------------------------------------------------------------------------------------------------------------------------------
test('the shared rules are the ones this copy pins: format, version printed, every rule compiles', async () => {
  const rules = await loadRules(RULES_FILE);
  assert.equal(rules.format, 'neutrality-rules/1'); assert.match(rules.version, /^0\.3\.\d+$/);
  assert.ok(rules.strings.length >= 20 && rules.binaryAssets && rules.mustContain.length >= 4);
  assert.ok(existsSync(BRAND_HASHES_FILE) && JSON.parse(readFileSync(BRAND_HASHES_FILE, 'utf8')).files.length > 50, 'the brand asset hashes are in the repository');
  assert.ok((await inventoryHosts()).size > 5);
});

// ---- controls: this application's wiring really catches a leak -----------------------------------------------------------------------------------------------
async function problemsFor(files, options = {}) {
  const dir = folderWith('control-' + Math.random().toString(36).slice(2), files);
  // a control looks at one folder, so exceptions that only the real outputs use are not its business
  return (await plcScan({roots: [dir], requireAttribution: false, hostCheck: false, ...options})).problems.filter((p) => !/matches nothing that was scanned/.test(p)).join('\n');
}
test('negative control: each of PLC\'s own recent leaks is caught if it comes back', async () => {
  assert.match(await problemsFor({'chat/a.mjs': '// published with /cosmoshot/tools/ops/cdn_publish.py'}), /internal-leak/);
  assert.match(await problemsFor({'runtime/b.mjs': '// (Centroid 2.31x at 137 ms, Boiler 2.00x at 150 ms)'}), /internal-leak/);
  assert.match(await problemsFor({'chat/c.mjs': '// the formats CLAUDE.md says to preserve'}), /internal-leak/);
  assert.match(await problemsFor({'chat/presentation/d.mjs': '// Character presentation view model (board T444, objective O133).'}), /board-reference/);
  assert.match(await problemsFor({'chat/e.mjs': '// see Cosmoshot'}), /programme-internal-name/);
});
test('negative control: the family name, in any spelling, and our hosts are caught outside the one allowed place', async () => {
  assert.match(await problemsFor({'chat/f.mjs': 'const s = "from ai of our own";'}), /family-name/);
  assert.match(await problemsFor({'chat/g.mjs': 'const s = "https://cdn.aiofourown.com/other/";'}), /our-hosts/);
  // the disclosed default model source is allowed only as itself: a second address in the same file still fails
  const second = await problemsFor({'index.html': '<script>window.APP_CONFIG={"base":"https://cdn.aiofourown.com/models/"};</script> <a href="https://cdn.aiofourown.com/other/">x</a>'});
  assert.match(second, /cdn\.aiofourown\.com/); assert.ok(!/models\//.test(second), 'the covered default is not reported: ' + second);
});
test('negative control: putting the development-site hostname test back into sw.js fails the scan', async () => {
  const sw = readFileSync(path.join(built.app || build('app'), 'sw.js'), 'utf8');
  assert.equal(await problemsFor({'sw.js': sw}), '');
  const withCheck = sw.replace('.filter(file=>DEVELOPMENT_NATIVE||', ".filter(file=>location.hostname==='dev.privatelocal.chat'||");
  assert.notEqual(withCheck, sw, 'the line this control replaces is no longer in sw.js');
  assert.match(await problemsFor({'sw.js': withCheck}), /sw\.js: "dev\.privatelocal\.chat" matches the rule "our-hosts"/);
});
test('the product name PrivateLocal.Chat is neither a host nor another project', async () => {
  assert.equal(await problemsFor({'index.html': '<title>PrivateLocal.Chat</title><p>Private Local Chat</p>'}), '');
});
test('negative control: a brand asset renamed is caught by its hash, and a name-only match is a warning', async () => {
  const hashes = JSON.parse(readFileSync(BRAND_HASHES_FILE, 'utf8')).files;
  assert.ok(hashes.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  const dir = folderWith('renamed-brand-asset', {'chat/ok.mjs': 'ok'});
  const real = ['/cosmoshot/brand/aiofourown/packets/1.1.0/wordmark-light.svg'].find((f) => existsSync(f));
  if (real) { writeFileSync(path.join(dir, 'img-renamed.svg'), readFileSync(real)); assert.ok(hashes.some((f) => f.sha256 === sha(real))); }
  const result = await plcScan({roots: [dir], requireAttribution: false, hostCheck: false});
  if (real) assert.ok(result.problems.some((p) => p.includes('img-renamed.svg') && p.includes('brand-asset')), result.problems.join('|'));
});
test('negative control: a host that is not in the network inventory fails the scan', async () => {
  const dir = folderWith('unknown-host', {'chat/x.mjs': 'fetch("https://telemetry.unknown-host.test/ping")'});
  const result = await plcScan({roots: [dir], requireAttribution: false});
  assert.ok(result.problems.some((p) => /telemetry\.unknown-host\.test/.test(p)), result.problems.join('|'));
});
test('negative control: a build without the attribution block fails, and a missing LICENSE does too', async () => {
  const dir = folderWith('no-attribution', {'index.html': '<p>app</p>'});
  const result = await plcScan({roots: [dir], hostCheck: false});
  for (const part of ['attribution.json', 'LICENSE', 'attribution check failed']) assert.ok(result.problems.some((p) => p.includes(part)), part + ': ' + result.problems.join('|'));
});
test('negative control: an exception that nothing uses fails the scan', async () => {
  const dir = folderWith('stale-exception', {'chat/ok.mjs': 'ok'});
  const stale = path.join(scratch, 'stale-exceptions.json');
  writeFileSync(stale, JSON.stringify({format: 'neutrality-exceptions/1', application: 'Private Local Chat', exceptions: [{rule: 'our-hosts', paths: ['nothing/here'], why: 'no longer true'}]}));
  const result = await plcScan({roots: [dir], exceptionsFile: stale, requireAttribution: false, hostCheck: false});
  assert.ok(result.problems.some((p) => /matches nothing/.test(p)), result.problems.join('|'));
});
test('the exceptions file is well formed and names no rule that does not exist', async () => {
  const result = await plcScan({roots: [folderWith('well-formed', {'chat/ok.mjs': 'ok'})], requireAttribution: false, hostCheck: false});
  assert.ok(!result.problems.some((p) => /exceptions file/.test(p)), result.problems.join('|'));
  assert.equal(JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8')).application, 'Private Local Chat');
});
