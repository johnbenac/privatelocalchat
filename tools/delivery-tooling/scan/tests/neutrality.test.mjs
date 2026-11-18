// Tests of the neutrality scan engine (scan/neutrality.mjs). No network, no dependencies: `node --test scan/tests/`.
// The rules here are a small file in the same shape as Brand's shared one; the last tests also run the real shared file when it is present on this machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {scan, tokenAround, checkExceptions, loadRules, loadExceptions, visibleKind, visibleText, attributionRegions, format, unpack, globToRegExp} from '../neutrality.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATTRIBUTION = path.resolve(HERE, '../../attribution/attribution.py');
const SHARED = '/cosmoshot/brand/delivery/neutrality-rules.json';
const NOW = Date.parse('2026-11-18T12:00:00Z');
const COMMIT = 'a'.repeat(40);

const rules = {
  format: 'neutrality-rules/1', version: 'test-1',
  attributionExemption: {paths: ['NOTICE.md', 'SOURCE.txt', 'attribution.json', 'README.md', 'about/index.html', 'help/index.html'], exemptRules: ['family-name', 'our-hosts']},
  strings: [
    {id: 'family-name', severity: 'fail', scope: 'all', pattern: 'ai[\\s_-]*of[\\s_-]*our[\\s_-]*own|aiofourown', flags: 'i'},
    {id: 'other-app-names', severity: 'fail', scope: 'all', pattern: 'private\\s*local\\.?\\s*chat|sonalon', flags: 'i'},
    {id: 'our-hosts', severity: 'fail', scope: 'all', pattern: '(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*(?:ours\\.example|privatelocal\\.chat)(?![a-z0-9-])', flags: ''},
    {id: 'internal-leak', severity: 'fail', scope: 'all', pattern: '/cosmoshot/|\\bcentroid\\b|CLAUDE\\.md', flags: 'i'},
    {id: 'board-reference', severity: 'fail', scope: 'all', pattern: '\\bboard\\s+[TO][0-9]{2,4}\\b', flags: 'i'},
    {id: 'email-address', severity: 'warn', scope: 'all', pattern: '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}', flags: 'i'},
    {id: 'voice-hype', severity: 'warn', scope: 'visible', pattern: 'revolutionary|seamless', flags: 'i'}
  ],
  binaryAssets: {extensions: ['.png', '.svg'], pathNames: ['wordmark-light.svg']},
  mustContain: []
};
const ex = (over = {}) => ({format: 'neutrality-exceptions/1', application: 'Demo', productNames: [], exceptions: [], ...over});
const mk = async (tree) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scan-test-'));
  for (const [rel, content] of Object.entries(tree)) { await mkdir(path.dirname(path.join(dir, rel)), {recursive: true}); await writeFile(path.join(dir, rel), content); }
  return dir;
};
const run = async (tree, exceptions = ex(), extra = {}) => {
  const dir = await mk(tree);
  try { return await scan({roots: [dir], rules: extra.rules || rules, exceptions, requireAttribution: false, brandHashes: new Map(), now: NOW, ...extra}); } finally { await rm(dir, {recursive: true, force: true}); }
};
const has = (list, text) => list.some((l) => l.includes(text));

test('a clean folder has nothing to fix', async () => {
  const r = await run({'index.html': '<p>Hello</p>', 'app.js': 'export const a = 1;'});
  assert.deepEqual(r.problems, []); assert.equal(r.files, 2); assert.equal(r.rulesVersion, 'test-1');
});

test('each failing rule is found, with the file and the matched text', async () => {
  const cases = [['family-name', 'from Ai Of Our Own'], ['family-name', 'ai_of-our own'], ['our-hosts', 'https://cdn.ours.example/x'], ['our-hosts', 'privatelocal.chat'], ['internal-leak', '// see /cosmoshot/tools'],
    ['internal-leak', 'ask the Centroid box'], ['board-reference', '// board T444 says'], ['other-app-names', 'works with Sonalon']];
  for (const [id, text] of cases) { const r = await run({'a.js': text}); assert.ok(has(r.problems, `a.js: "`) && has(r.problems, `"${id}"`), `${id}: ${text}: ${r.problems}`); }
});

test('hosts are matched in lower case only, so the product name PrivateLocal.Chat is not a host', async () => {
  const r = await run({'a.md': 'PrivateLocal.Chat is the name.'}, ex());
  assert.ok(!has(r.problems, 'our-hosts'), r.problems.join('|'));
});

test('warn rules are reported and never fail', async () => {
  const r = await run({'a.js': 'contact someone@example.org'});
  assert.deepEqual(r.problems, []); assert.ok(has(r.warnings, 'email-address'));
});

test('productNames are removed before the other-app-names rule: the application\'s own name is not another project', async () => {
  const tree = {'a.md': 'Welcome to PrivateLocal.Chat and Private Local Chat.'};
  assert.ok(has((await run(tree)).problems, 'other-app-names'));
  assert.deepEqual((await run(tree, ex({productNames: ['private\\s*local\\.?\\s*chat']}))).problems, []);
});

test('the visible scope: text nodes, alt and aria-label count; script, style, comments and vendor/ do not; JS is visible only when listed', async () => {
  const html = '<html><head><title>A seamless title</title><style>.revolutionary{}</style><script>var seamless=1</script></head><body><!-- revolutionary --><img alt="revolutionary picture"><button aria-label="seamless">x</button></body></html>';
  const r = await run({'index.html': html, 'vendor/lib.html': '<p>revolutionary</p>', 'LICENSE': 'seamless', 'ui.js': 'const t = "revolutionary"'});
  const lines = r.warnings.filter((w) => w.includes('voice-hype'));
  assert.ok(lines.some((l) => l.includes('index.html')), 'html text found: ' + r.warnings);
  assert.ok(!lines.some((l) => l.includes('vendor/') || l.includes('LICENSE') || l.includes('ui.js')), lines.join('|'));
  assert.ok((await run({'ui.js': 'const t = "revolutionary"'}, ex({visibleFiles: ['ui.js']}))).warnings.some((w) => w.includes('ui.js')), 'a listed UI string table is visible');
  assert.equal(visibleKind('help/index.html'), 'html'); assert.equal(visibleKind('NOTICE.md'), 'whole'); assert.equal(visibleKind('vendor/x.md'), null); assert.equal(visibleKind('a.js'), null);
  assert.equal(visibleKind('manifest.webmanifest'), 'manifest');
  assert.equal(visibleText('manifest', '{"name":"N","short_name":"S","icons":[{"name":"no"}]}'), 'N\nS');
  assert.ok(visibleText('html', '<meta name="description" content="Meta text"><input type="submit" value="Go"><input type="text" value="skip"><script type="application/ld+json">{"name":"LD name","url":"x"}</script>').split('\n').includes('Meta text'));
  assert.ok(visibleText('html', '<input type="submit" value="Go"><input type="text" value="skip">').includes('Go') && !visibleText('html', '<input type="text" value="skip">').includes('skip'));
  assert.ok(visibleText('html', '<script type="application/ld+json">{"name":"LD name","url":"x"}</script>').includes('LD name'));
});

test('the attribution region exempts the family name and our hosts only inside it; a second mention fails; the region must equal attribution.json', async () => {
  const rec = {name: 'Demo', version: '1.0.0', commit: COMMIT, licence: 'AGPL-3.0-only', source: 'https://forge.aiofourown.com/programme/demo'};
  const block = `Demo 1.0.0 from ai of our own\nBuilt from commit ${COMMIT} Licence: AGPL-3.0-only Source: https://forge.aiofourown.com/programme/demo`;
  const good = {'attribution.json': JSON.stringify(rec), 'about/index.html': `<p>Hi</p><div class="attribution">Demo 1.0.0 <b>from ai of our own</b> Built from commit ${COMMIT} Licence: AGPL-3.0-only Source: <a href="https://forge.aiofourown.com/programme/demo">https://forge.aiofourown.com/programme/demo</a></div>`};
  assert.deepEqual((await run(good)).problems, [], 'inside the region is fine');
  assert.ok(has((await run({...good, 'about/index.html': good['about/index.html'] + '<p>Made by ai of our own</p>'})).problems, 'about/index.html: "ai of our own"'), 'a second mention fails');
  assert.ok(has((await run({...good, 'about/index.html': good['about/index.html'].replace('1.0.0', '9.9.9')})).problems, 'does not say the version'), 'the region must equal the record');
  assert.ok(has((await run({'about/index.html': good['about/index.html']})).problems, 'no attribution.json'), 'a region without a record fails');
  const comment = {...good, 'about/index.html': `<!--attribution-->${block}<!--/attribution--> and again aiofourown`};
  assert.ok(has((await run(comment)).problems, '"aiofourown"') && !has((await run(comment)).problems, 'the attribution region does not say'), 'comment markers work');
  const md = {'attribution.json': JSON.stringify(rec), 'README.md': `# Demo\n\n${block.replace(' from ai', '\nfrom ai').replace(' Built', '\nBuilt').replace(' Licence', '\nLicence').replace(' Source', '\nSource')}\n\nSee ai of our own.\n`};
  const mdr = await run(md);
  assert.ok(has(mdr.problems, 'README.md: "ai of our own"') && mdr.problems.length === 1, 'markdown: only the second mention fails: ' + mdr.problems);
  assert.equal(attributionRegions('README.md', 'x\nfrom ai of our own\nBuilt\nSource: u\ny').length, 1);
  assert.equal(attributionRegions('README.md', 'from ai of our own\nno source line').length, 0);
});

test('NOTICE.md, SOURCE.txt and attribution.json are exempt for the family name and hosts (attribution.py enforces their shape), but not for other rules', async () => {
  const r = await run({'NOTICE.md': 'from ai of our own\nSource: https://forge.aiofourown.com/programme/x\nboard T444', 'attribution.json': '{"source":"https://cdn.aiofourown.com/x/source/y"}'});
  assert.deepEqual(r.problems.filter((p) => !p.includes('board-reference')), []); assert.ok(has(r.problems, 'board-reference'));
});

test('exceptions: a used one passes, an unused one fails, one outside its paths does not apply', async () => {
  const tree = {'help/index.html': '<p>Run from files.ours.example</p>', 'a.js': 'x'};
  const base = {rule: 'our-hosts', paths: ['help/index.html'], why: 'the page names the hosted copy', userVisible: true}; // the page text is read by a person, so the exception says so
  assert.deepEqual((await run(tree, ex({exceptions: [base]}))).problems, []);
  assert.ok(has((await run({'a.js': 'x'}, ex({exceptions: [base]}))).problems, 'matches nothing'), 'unused fails');
  assert.ok(has((await run({'other.html': 'files.ours.example'}, ex({exceptions: [base]}))).problems, 'matches the rule "our-hosts"'), 'outside its paths is a hit');
});

test('an exception with match covers one specific string only: another match in the same file still fails, and an unused match is unused', async () => {
  const tree = {'index.html': '<script>window.APP_CONFIG={"base":"https://cdn.ours.example/models/"}</script>\n<p>See also https://files.ours.example/other</p>'};
  const e = {rule: 'our-hosts', paths: ['index.html'], why: 'the disclosed default model source', match: 'cdn\\.ours\\.example/models/'};
  const r = await run(tree, ex({exceptions: [e]}));
  assert.ok(has(r.problems, 'files.ours.example') && !has(r.problems, 'cdn.ours.example'), 'only the second mention fails: ' + r.problems.join('|'));
  assert.deepEqual((await run({'index.html': tree['index.html'].split('\n')[0]}, ex({exceptions: [e]}))).problems, [], 'with only the covered string nothing fails');
  assert.ok(has((await run({'index.html': '<p>files.ours.example</p>'}, ex({exceptions: [e]}))).problems, 'matches nothing'), 'an exception whose match never holds is unused');
  assert.ok(checkExceptions(ex({exceptions: [{...e, match: '('}]}), rules, NOW).some((p) => p.includes('match is not a valid')));
});

test('match is judged on the token around each match, never on the line: two URLs on one line, one covered and one not', async () => {
  const line = '{"a":"https://cdn.ours.example/models/x","b":"https://files.ours.example/other","c":"https://cdn.ours.example/models/y"}';
  const e = {rule: 'our-hosts', paths: ['min.js'], why: 'the disclosed default', match: 'cdn\\.ours\\.example/models/'};
  const r = await run({'min.js': line}, ex({exceptions: [e]}));
  assert.equal(r.problems.length, 1, r.problems.join('|')); assert.ok(has(r.problems, '"files.ours.example"'), 'the uncovered URL on the same line fails: ' + r.problems);
  assert.deepEqual((await run({'min.js': line.replace('https://files.ours.example/other', 'x')}, ex({exceptions: [e]}))).problems, [], 'covered URLs on one line pass');
  assert.equal(tokenAround('a "https://x.example/p?q=1" b', 8, 9), 'https://x.example/p?q=1');
  assert.equal(tokenAround('see (https://x.example/p) now', 6, 9), 'https://x.example/p');
  assert.equal(tokenAround('<a href="mailto:a@b.c">', 3, 8), 'href="mailto:a@b.c', 'the matched text is kept whole; the token grows from its edges and stops at a quote, bracket or space');
  assert.equal(tokenAround('x "https://a.example/b" y', 4, 9), 'https://a.example/b', 'the quote before and after ends it');
});

test('any exception that covers a match in text a person reads needs userVisible: true; a match in code or data does not', async () => {
  const e = {rule: 'our-hosts', paths: ['*.html', '*.md', '*.js', '*.json'], why: 'the page names the hosted copy'};
  const files = {'page.html': '<p>Run it from https://files.ours.example/x</p>', 'doc.md': 'Hosted at files.ours.example', 'code.js': 'const u = "https://files.ours.example/x";', 'data.json': '{"u":"https://files.ours.example/x"}',
    'script.html': '<script>const u = "https://files.ours.example/x";</script>'};
  const flagged = (r) => r.problems.filter((p) => p.includes('needs userVisible')).map((p) => p.split(' ')[1].replace(/:$/, ''));
  const without = await run(files, ex({exceptions: [e]}));
  assert.deepEqual(flagged(without).sort(), ['doc.md', 'page.html'], 'only the two files whose matched text a person reads need the flag: ' + without.problems.join('|'));
  const withFlag = await run(files, ex({exceptions: [{...e, userVisible: true}]}));
  assert.deepEqual(withFlag.problems, [], 'with userVisible: true nothing fails: ' + withFlag.problems.join('|'));
  const attr = await run({'about.html': '<a href="https://files.ours.example/x" title="Open">link</a>'}, ex({exceptions: [{...e, paths: ['about.html']}]}));
  assert.deepEqual(attr.problems, [], 'an address in href is not one of the visible attributes');
  const alt = await run({'about.html': '<img alt="see files.ours.example" src="x.png">'}, ex({exceptions: [{...e, paths: ['about.html']}]}));
  assert.ok(has(alt.problems, 'needs userVisible'), 'alt text is read by a person: ' + alt.problems.join('|'));
});

test('an exception for another project\'s name on text a person reads needs userVisible: true', async () => {
  const tree = {'about/index.html': '<p>Works with Sonalon</p>'};
  const e = {rule: 'other-app-names', paths: ['about/index.html'], why: 'family navigation'};
  assert.ok(has((await run(tree, ex({exceptions: [e]}))).problems, 'userVisible: true'));
  assert.deepEqual((await run(tree, ex({exceptions: [{...e, userVisible: true}]}))).problems, []);
  assert.deepEqual((await run({'config/a.yaml': 'name: Sonalon'}, ex({exceptions: [{...e, paths: ['config/a.yaml']}]}))).problems, [], 'a data path needs no flag');
});

test('until: both task and date are required, at most 90 days ahead; an expired one fails; every one is listed, matching or not', async () => {
  const e = {rule: 'our-hosts', paths: ['a.js'], why: 'disclosed default'};
  assert.ok(checkExceptions(ex({exceptions: [{...e, until: 'T12'}]}), rules, NOW).some((p) => p.includes('both a task')));
  assert.ok(checkExceptions(ex({exceptions: [{...e, until: '2026-12-01'}]}), rules, NOW).some((p) => p.includes('both a task')));
  assert.ok(checkExceptions(ex({exceptions: [{...e, until: {task: 'T12', by: '2027-06-01'}}]}), rules, NOW).some((p) => p.includes('days ahead')));
  assert.deepEqual(checkExceptions(ex({exceptions: [{...e, until: {task: 'T12', by: '2027-01-01'}}]}), rules, NOW), []);
  const tree = {'a.js': 'https://cdn.ours.example/x'};
  const ok = await run(tree, ex({exceptions: [{...e, until: {task: 'T12', by: '2026-12-01'}}]}));
  assert.deepEqual(ok.problems, []); assert.ok(ok.until.some((u) => u.includes('T12') && u.includes('2026-12-01')));
  const expired = await run(tree, ex({exceptions: [{...e, until: {task: 'T12', by: '2026-11-17'}}]}));
  assert.ok(has(expired.problems, 'expired on 2026-11-17'));
  const unused = await run({'b.js': 'x'}, ex({exceptions: [{...e, until: {task: 'T12', by: '2026-12-01'}}]}));
  assert.ok(unused.until.some((u) => u.includes('matches nothing')) && has(unused.problems, 'matches nothing'));
  assert.ok(format(ok).includes('temporary exceptions (until):'));
});

test('a bad exceptions file is refused with the reasons; a rule that does not exist is one', async () => {
  const bad = checkExceptions({format: 'neutrality-exceptions/1', application: '', exceptions: [{rule: 'nope', paths: [], why: ''}], allowedHosts: [{hosts: []}]}, rules, NOW);
  for (const part of ['application', 'not a rule', 'paths are required', 'why is required', 'allowedHosts[0]']) assert.ok(bad.some((p) => p.includes(part)), part + ': ' + bad);
  assert.ok(checkExceptions({format: 'x'}, rules, NOW)[0].includes('format'));
  const r = await run({'a.js': 'x'}, ex({exceptions: [{rule: 'nope', paths: ['a'], why: 'w'}]}));
  assert.ok(has(r.problems, 'exceptions file'));
});

test('brand assets are matched by hash even when renamed, and a file named like one is a warning', async () => {
  const dir = await mk({'img/logo-renamed.png': 'PNGDATA', 'img/other.png': 'different', 'wordmark-light.svg': '<svg/>'});
  try {
    const {createHash} = await import('node:crypto');
    const h = createHash('sha256').update('PNGDATA').digest('hex');
    const r = await scan({roots: [dir], rules, exceptions: ex(), requireAttribution: false, brandHashes: new Map([[h, '1.0.0/mark.png']]), now: NOW});
    assert.ok(has(r.problems, 'img/logo-renamed.png') && has(r.problems, 'brand-asset') && !has(r.problems, 'other.png'), r.problems.join('|'));
    assert.ok(has(r.warnings, 'wordmark-light.svg'), r.warnings.join('|'));
    const r2 = await scan({roots: [dir], rules, exceptions: ex({exceptions: [{rule: 'brand-asset', paths: ['img/logo-renamed.png'], why: 'the app draws this mark'}]}), requireAttribution: false, brandHashes: new Map([[h, '1.0.0/mark.png']]), now: NOW});
    assert.ok(!has(r2.problems, 'logo-renamed'), 'an exception allows it');
    const none = await scan({roots: [dir], rules, exceptions: ex(), requireAttribution: false, manifests: ['/nonexistent/*/manifest.json'], now: NOW});
    assert.ok(has(none.problems, 'no brand packet manifests'), 'no manifests is a problem, never a silent pass');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('the optional host plug-in: unknown hosts fail, allowed hosts pass, unused allowed hosts fail; without it nothing is checked', async () => {
  const tree = {'a.js': 'fetch("https://models.example.org/x"); fetch("https://known.example.net/y")'};
  assert.deepEqual((await run(tree)).problems, [], 'no plug-in, no host check');
  const known = new Set(['known.example.net']);
  assert.ok(has((await run(tree, ex(), {knownHosts: known})).problems, 'models.example.org'));
  const allowed = ex({allowedHosts: [{hosts: ['models.example.org'], paths: ['a.js'], why: 'the default model source'}]});
  assert.deepEqual((await run(tree, allowed, {knownHosts: known})).problems, []);
  assert.ok(has((await run({'b.js': 'x'}, allowed, {knownHosts: known})).problems, 'matches nothing'));
});

test('a folder with no files is a problem, not a pass', async () => {
  const r = await run({});
  assert.ok(has(r.problems, 'no files were scanned'));
});

test('skipPaths are not scanned', async () => {
  assert.deepEqual((await run({'skip/a.js': 'aiofourown', 'b.js': 'x'}, ex(), {skipPaths: ['skip/**']})).problems, []);
});

test('globs: * stays in a folder, ** crosses folders', () => {
  assert.ok(globToRegExp('a/*.js').test('a/b.js') && !globToRegExp('a/*.js').test('a/b/c.js'));
  assert.ok(globToRegExp('a/**').test('a/b/c.js') && globToRegExp('**/x.js').test('x.js') && globToRegExp('**/x.js').test('a/b/x.js'));
});

// ---- the attribution call and the real shared file (need python and the repository's attribution.py) ----
const havePython = existsSync('/usr/bin/python3') && existsSync(ATTRIBUTION);
const attributionFolder = async (extra = {}) => {
  const dir = await mk({'index.html': '<p>app</p>', LICENSE: 'AGPL-3.0-only text', ...extra});
  const w = spawnSync('/usr/bin/python3', [ATTRIBUTION, 'write', dir, '--name', 'Demo', '--version', '1.0.0', '--commit', COMMIT, '--licence', 'AGPL-3.0-only', '--source', 'https://forge.aiofourown.com/programme/demo'], {encoding: 'utf8'});
  assert.equal(w.status, 0, w.stderr);
  return dir;
};
const shared = existsSync(SHARED);

test('the engine calls attribution.py check: a good build passes, a second mention of our name fails, a missing script is a failure', {skip: !havePython || !shared}, async () => {
  const sharedRules = await loadRules(SHARED);
  const good = await attributionFolder();
  try {
    const r = await scan({roots: [good], rules: sharedRules, exceptions: ex(), manifests: ['/nonexistent/*.json'], brandHashes: new Map(), now: NOW});
    assert.deepEqual(r.problems, [], 'good build: ' + r.problems.join('|'));
    await writeFile(path.join(good, 'NOTICE.md'), (await readFile(path.join(good, 'NOTICE.md'), 'utf8')) + '\nAlso from ai of our own.\n');
    const bad = await scan({roots: [good], rules: sharedRules, exceptions: ex(), brandHashes: new Map(), now: NOW});
    assert.ok(has(bad.problems, 'attribution check failed'), bad.problems.join('|'));
    const missing = await scan({roots: [good], rules: sharedRules, exceptions: ex(), brandHashes: new Map(), attributionScript: '/nonexistent/attribution.py', now: NOW});
    assert.ok(has(missing.problems, 'a missing check is a failure'), missing.problems.join('|'));
  } finally { await rm(good, {recursive: true, force: true}); }
});

test('the command line: exit 0 on a clean build, 1 on problems, 2 on bad input; a released archive is unpacked and scanned', {skip: !havePython || !shared}, async () => {
  const exFile = await mk({'ex.json': JSON.stringify(ex())});
  const good = await attributionFolder();
  const cli = (...args) => spawnSync('node', [path.join(HERE, '../neutrality.mjs'), '--rules', SHARED, '--exceptions', path.join(exFile, 'ex.json'), '--no-binary-assets', ...args], {encoding: 'utf8'});
  try {
    const ok = cli(good); assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.ok(ok.stdout.includes('version'), ok.stdout);
    await writeFile(path.join(good, 'app.js'), '// see /cosmoshot/tools/x\n');
    const bad = cli(good); assert.equal(bad.status, 1); assert.ok(bad.stdout.includes('internal-leak'), bad.stdout);
    assert.equal(cli().status, 2); assert.equal(cli('--bogus', good).status, 2);
    await rm(path.join(good, 'app.js'));
    const tar = path.join(exFile, 'release.tar'); assert.equal(spawnSync('tar', ['-cf', tar, '-C', good, '.']).status, 0);
    const fromArchive = cli('--archive', tar); assert.equal(fromArchive.status, 0, fromArchive.stdout + fromArchive.stderr);
    const dir = await unpack(tar); assert.ok(existsSync(path.join(dir, 'NOTICE.md'))); await rm(dir, {recursive: true, force: true});
  } finally { await rm(good, {recursive: true, force: true}); await rm(exFile, {recursive: true, force: true}); }
});

test('the real shared rule file loads, is frozen at neutrality-rules/1, and every pattern compiles', {skip: !shared}, async () => {
  const r = await loadRules(SHARED);
  assert.equal(r.format, 'neutrality-rules/1'); assert.ok(r.strings.length >= 15); assert.match(r.version, /^\d/);
  await assert.rejects(loadRules(path.join(HERE, 'neutrality.test.mjs')), /./);
});
