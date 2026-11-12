// The release zips (scripts/package-release.mjs, docs/RELEASING.md): deterministic, readable by ordinary zip tools, and holding what a person needs to run the app and nothing of the
// development site.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildModelsManifest, modelsManifestText} from '../scripts/models-manifest.mjs';
import {makeZip, packageRelease, RELEASE_TOOLS, writeSums, folderName, zipName, readmeText, sourceText} from '../scripts/package-release.mjs';

const scratch = mkdtempSync(path.join(tmpdir(), 'plc-package-'));
test.after(() => rmSync(scratch, {recursive: true, force: true}));
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const VERSION = '0.64.0';

const python = (code, ...args) => execFileSync('python3', ['-I', '-c', code, ...args], {encoding: 'utf8'});
const pyList = (zip) => JSON.parse(python('import sys,json,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps({"bad":z.testzip(),"entries":[[i.filename,i.file_size,i.date_time,(i.external_attr>>16)&0o777,i.compress_type] for i in z.infolist()]}))', zip));
const unzipTest = (zip) => spawnSync('unzip', ['-tq', zip], {encoding: 'utf8'});

// ---- the zip writer -----------------------------------------------------------------------------------------------------------------------------------
test('the zip writer makes archives that unzip and Python read, sorted, with fixed times and modes', () => {
  const noise = Buffer.concat(Array.from({length: 128}, (_, i) => createHash('sha256').update('noise' + i).digest())); // 4096 bytes that do not compress
  const entries = [
    {name: 'f/z.txt', data: Buffer.from('last'), mode: 0o644},
    {name: 'f/ünï.txt', data: Buffer.from('unicode name'), mode: 0o644},
    {name: 'f/empty', data: Buffer.alloc(0), mode: 0o644},
    {name: 'f/run.mjs', data: Buffer.from('#!/usr/bin/env node\n'.repeat(200)), mode: 0o755},
    {name: 'f/noise.bin', data: noise, mode: 0o644}
  ];
  const zip = path.join(scratch, 'unit.zip');
  const bytes = makeZip(entries, 1762927272);
  writeFileSync(zip, bytes);
  assert.equal(unzipTest(zip).status, 0, unzipTest(zip).stdout + unzipTest(zip).stderr);
  const listed = pyList(zip);
  assert.equal(listed.bad, null);
  assert.deepEqual(listed.entries.map((e) => e[0]), ['f/empty', 'f/noise.bin', 'f/run.mjs', 'f/z.txt', 'f/ünï.txt']);
  assert.ok(listed.entries.every((e) => e[2].join() === '2025,11,12,6,1,12'));
  assert.deepEqual(listed.entries.map((e) => e[3]), [0o644, 0o644, 0o755, 0o644, 0o644]);
  const method = Object.fromEntries(listed.entries.map((e) => [e[0], e[4]]));
  assert.deepEqual([method['f/empty'], method['f/noise.bin'], method['f/run.mjs']], [0, 0, 8], 'empty and incompressible files are stored, compressible ones deflated');
  const content = python('import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nsys.stdout.write(z.read("f/ünï.txt").decode()+"|"+str(len(z.read("f/noise.bin"))))', zip);
  assert.equal(content, 'unicode name|4096');
  assert.deepEqual(makeZip([...entries].reverse(), 1762927272), bytes, 'the order the files are given in does not matter');
  assert.notDeepEqual(makeZip(entries, 1762927272 + 100), bytes, 'the time is in the bytes, so it is the commit time that fixes them');
});

// ---- the release zips ---------------------------------------------------------------------------------------------------------------------------------
const made = {};
for (const target of ['app', 'runkit']) {
  test(`the ${target} zip is built twice to the same bytes, holds the target and the files to run it, and nothing of the development site`, async () => {
    const a = await packageRelease({target, version: VERSION, commit: HEAD, outDir: path.join(scratch, 'a')});
    const b = await packageRelease({target, version: VERSION, commit: HEAD, outDir: path.join(scratch, 'b')});
    assert.equal(path.basename(a), zipName(VERSION, target));
    assert.ok(readFileSync(a).equals(readFileSync(b)), 'two builds of the same commit differ');
    made[target] = a;
    assert.equal(unzipTest(a).status, 0, unzipTest(a).stdout);
    const {bad, entries} = pyList(a);
    assert.equal(bad, null);
    const folder = folderName(VERSION, target) + '/';
    const names = entries.map((e) => e[0]);
    assert.ok(names.every((n) => n.startsWith(folder)), 'everything is inside one folder');
    const top = new Set(names.map((n) => n.slice(folder.length).split('/')[0]));
    const expectedTop = [...RELEASE_TOOLS, 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'SOURCE.txt', 'compat.json', 'models.json', 'app'];
    assert.deepEqual([...top].sort(), [...expectedTop].sort(), 'the top level of the zip is the tools and documents listed, and the app');
    for (const name of ['app/index.html', 'app/sw.js', 'app/_headers', 'app/version.json', 'app/manifest.webmanifest']) assert.ok(names.includes(folder + name), name + ' is missing');
    assert.deepEqual(names, [...names].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y))));
    // nothing of the development site, and no page beyond the target's
    assert.ok(!names.some((n) => /\/_worker\.js$|\/_routes\.json$|(^|\/)dev-tools\//.test(n)), 'development tooling in the zip');
    const pages = ['help', 'about', 'privacy', 'updates'].filter((p) => names.includes(`${folder}app/${p}/index.html`));
    assert.deepEqual(pages, target === 'runkit' ? ['help', 'about'] : []);
    for (const file of ['sitemap.xml', 'robots.txt', 'updates/rss.xml']) assert.ok(!names.includes(`${folder}app/${file}`), file);
    // the modes: the server can be run, nothing else is executable
    assert.deepEqual(entries.filter((e) => e[3] === 0o755).map((e) => e[0]), [folder + 'serve.mjs']);
    assert.deepEqual(RELEASE_TOOLS.slice(0, 3), ['serve.mjs', 'headers.mjs', 'zip.mjs'], 'the first tools are listed in one place, one name per line');
    for (const tool of ['operator.mjs', 'overlay.mjs', 'plc.mjs']) assert.ok(RELEASE_TOOLS.includes(tool) && top.has(tool), tool + ' ships in the zip root');
  });

  test(`the ${target} zip says the version it was released as, and where its source is`, async () => {
    const folder = folderName(VERSION, target);
    const text = (file) => python('import sys,zipfile\nsys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())', made[target], `${folder}/${file}`);
    const info = JSON.parse(text('app/version.json'));
    assert.deepEqual([info.version, info.environment, info.commit], [VERSION, 'release', HEAD]);
    const source = text('SOURCE.txt');
    assert.ok(source.includes(HEAD) && source.includes(`v${VERSION}`) && source.includes('https://github.com/johnbenac/privatelocalchat'));
    assert.match(source, /complete corresponding source of every GPL-covered part/);
    assert.match(source, new RegExp(`TARGET=${target} RELEASE_VERSION=${VERSION} DEPLOY_BRANCH=main GITHUB_SHA=${HEAD} SOURCE_DATE_EPOCH=\\d+ npm run build`));
    assert.equal(text('README.md'), readmeText({version: VERSION, target}));
    assert.equal(text('LICENSE'), readFileSync('LICENSE', 'utf8'));
    assert.equal(text('THIRD-PARTY-NOTICES.md'), readFileSync('THIRD-PARTY-NOTICES.md', 'utf8'));
    for (const tool of RELEASE_TOOLS) assert.equal(text(tool), readFileSync(`scripts/${tool}`, 'utf8'), tool);
    assert.equal(text('models.json'), modelsManifestText(await buildModelsManifest()), 'models.json in the zip is the manifest the script builds');
    const compat = JSON.parse(text('compat.json'));
    assert.deepEqual([compat.format, compat.version, compat.commit], ['plc-compat/1', VERSION, HEAD]);
    assert.equal(text('compat.json'), execFileSync('node', ['scripts/compat.mjs', '--version', VERSION, '--commit', HEAD], {encoding: 'utf8'}), 'compat.json in the zip is what the script prints');
  });
}

test('the unpacked folder runs by itself with node serve.mjs and sends the headers of its build', async () => {
  const dir = path.join(scratch, 'unpacked');
  mkdirSync(dir);
  execFileSync('unzip', ['-q', made.app, '-d', dir]);
  const folder = path.join(dir, folderName(VERSION, 'app'));
  const {startServer} = await import(pathToFileURL(path.join(folder, 'serve.mjs')).href);
  const {server, port} = await startServer({dir: path.join(folder, 'app'), port: 0, quiet: true});
  try {
    const sw = await fetch(`http://127.0.0.1:${port}/sw.js`);
    assert.equal(sw.status, 200);
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.equal(sw.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal((await (await fetch(`http://127.0.0.1:${port}/version.json`)).json()).version, VERSION);
    assert.equal((await fetch(`http://127.0.0.1:${port}/help/`)).status, 404, 'the app target has no Help page');
  } finally { server.close(); }
});

// ---- checksums, refusals --------------------------------------------------------------------------------------------------------------------------------
test('SHA256SUMS is read by sha256sum -c, and a changed file fails it', async () => {
  const dir = path.join(scratch, 'sums');
  mkdirSync(dir);
  for (const target of ['app', 'runkit']) writeFileSync(path.join(dir, zipName(VERSION, target)), readFileSync(made[target]));
  writeFileSync(path.join(dir, 'compat.json'), '{"format":"plc-compat/1"}\n');
  const lines = await writeSums(dir);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.split('  ')[1]), ['compat.json', zipName(VERSION, 'app'), zipName(VERSION, 'runkit')]);
  assert.equal(spawnSync('sha256sum', ['-c', 'SHA256SUMS'], {cwd: dir, encoding: 'utf8'}).status, 0);
  writeFileSync(path.join(dir, 'compat.json'), '{"format":"plc-compat/1","changed":true}\n');
  assert.notEqual(spawnSync('sha256sum', ['-c', 'SHA256SUMS'], {cwd: dir, encoding: 'utf8'}).status, 0);
});
test('negative control: a bad target, a bad version, or a commit that is not checked out is refused', async () => {
  const out = path.join(scratch, 'refused');
  await assert.rejects(packageRelease({target: 'site', version: VERSION, commit: HEAD, outDir: out}), /--target must be one of app, runkit/);
  await assert.rejects(packageRelease({target: 'app', version: 'v0.64.0', commit: HEAD, outDir: out}), /--version must be a version/);
  await assert.rejects(packageRelease({target: 'app', version: VERSION, commit: 'a'.repeat(40), outDir: out}), /not at aaaa/);
  await assert.rejects(packageRelease({target: 'app', version: VERSION, commit: 'abc', outDir: out}), /full commit hash/);
  assert.ok(!existsSync(out), 'nothing was written');
});
test('the temporary build folder is removed, and only the files of the release are left in the output folder', async () => {
  // A folder of this test's own: other test files build in the repository root at the same time, so the root cannot be inspected.
  const work = mkdtempSync(path.join(process.cwd(), '.tmp-pkgwork-'));
  try {
    const out = path.join(scratch, 'clean-out');
    const file = await packageRelease({target: 'app', version: VERSION, commit: HEAD, outDir: out, workDir: work});
    assert.deepEqual(readdirSync(work), [], 'the build folder was removed');
    assert.deepEqual(readdirSync(out), [path.basename(file)]);
  } finally { rmSync(work, {recursive: true, force: true}); }
});
test('the texts name the version and the target', () => {
  assert.match(readmeText({version: '1.2.3', target: 'app'}), /Private Local Chat 1\.2\.3 \(app\)/);
  assert.match(sourceText({version: '1.2.3', target: 'runkit', commit: 'b'.repeat(40), epoch: 7}), /TARGET=runkit RELEASE_VERSION=1\.2\.3 .*SOURCE_DATE_EPOCH=7/);
});
