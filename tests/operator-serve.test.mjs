// serve.mjs --root: each request is answered from the live release of an operator folder, with the operator's settings, pages and models laid over it (scripts/overlay.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {startServer} from '../scripts/serve.mjs';
import {upgrade, rollback} from '../scripts/operator.mjs';
import {toPagesHeaders} from '../scripts/headers.mjs';
import {makeRelease, commitOf, scratchDir, removeDir} from './helpers/operator-fixtures.mjs';

const SITE = {format: 'plc-site/1', pages: {help: '/help/'}};
const pageOf = (version, base) => `<!doctype html><title>${version}</title><script src="/build-info.js"></script><script>window.SITE_LINKS=${JSON.stringify({format: 'plc-site/1', pages: {}})};</script><script>window.APP_CONFIG=${JSON.stringify({format: 'plc-app-config/1', modelSources: [{id: 'shipped', label: 'Shipped', base}], overridden: false})};</script><p>${version}</p>\n`;
const SHIPPED = {'1.0.0': 'https://one.test/models/', '1.1.0': 'https://two.test/models/'};

/** An operator folder with the releases given installed in order (the last is live); `after` runs before the servers start. */
async function makeRoot(versions = ['1.0.0'], {runkit = true} = {}) {
  const base = scratchDir('plc-opserve-');
  const root = path.join(base, 'root');
  const folders = {};
  for (const [i, version] of versions.entries()) {
    const folder = await makeRelease({dir: path.join(base, 'src' + i), version, target: runkit ? 'runkit' : 'app', commit: commitOf(i + 1)});
    const app = path.join(folder, 'app');
    fs.writeFileSync(path.join(app, 'index.html'), pageOf(version, SHIPPED[version]));
    fs.writeFileSync(path.join(app, '_headers'), toPagesHeaders() + `\n/manifest.webmanifest\n  X-Probe: ${version}\n`);
    folders[version] = folder;
    if (i === 0) fs.mkdirSync(root, {recursive: true});
    await upgrade({root, source: folder});
  }
  const live = versions.at(-1);
  const commit = commitOf(versions.length);
  const appDir = path.join(root, 'releases', `${live}-${runkit ? 'runkit' : 'app'}`, 'app');
  return {base, root, folders, appDir, commit, release: (v) => path.join(root, 'releases', `${v}-${runkit ? 'runkit' : 'app'}`, 'app')};
}

let tick = 0;
/** Writes a file so that a change is seen even when the size is the same and the clock has not moved. */
function put(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof text === 'string' ? text : JSON.stringify(text));
  const when = new Date(Date.now() + 5000 * ++tick);
  fs.utimesSync(file, when, when);
}

async function serve(root, extra = {}) {
  const lines = [];
  const started = await startServer({root, port: 0, quiet: true, warn: (l) => lines.push(l), ...extra});
  return {...started, lines, url: (p) => `http://127.0.0.1:${started.port}${p}`};
}
const withRoot = (versions, options, body) => async () => {
  const r = await makeRoot(versions, options);
  const s = await serve(r.root);
  try { await body({...r, ...s}); } finally { s.server.close(); removeDir(r.base); }
};
const text = async (res) => (await res).text();
const module_ = async (appDir, commit, file) => import(pathToFileURL(path.join(appDir, 'releases', commit, file)).href);
const appElement = (mod, defaults, override) => `<script>window.APP_CONFIG=${JSON.stringify(mod.buildAppConfig({format: 'plc-app-config/1', modelSources: defaults}, override)).replace(/</g, '\\u003c')};</script>`;

// ---- item 1: the release is found again on every request ---------------------------------------------------------------------------------------------
test('a root with no operator files is served like the release in plain mode', withRoot(['1.0.0'], {}, async (c) => {
  const plain = await startServer({dir: c.appDir, port: 0, quiet: true});
  try {
    for (const p of ['/', '/index.html', '/sw.js', '/version.json', `/releases/${c.commit}/assets/main.js`, `/releases/${c.commit}/assets/data.bin`, '/help/', '/missing']) {
      const [a, b] = [await fetch(c.url(p)), await fetch(`http://127.0.0.1:${plain.port}${p}`)];
      assert.equal(a.status, b.status, p);
      assert.deepEqual([...a.headers].filter(([k]) => k !== 'date'), [...b.headers].filter(([k]) => k !== 'date'), p + ' headers');
      assert.equal(Buffer.compare(Buffer.from(await a.arrayBuffer()), Buffer.from(await b.arrayBuffer())), 0, p + ' body');
    }
  } finally { plain.server.close(); }
}));

test('a root with nothing installed is refused at start with the way to install', async () => {
  const dir = scratchDir('plc-opserve-empty-');
  try { await assert.rejects(startServer({root: dir, quiet: true}), (e) => e.message.includes('Nothing is installed in') && e.message.includes('--upgrade')); }
  finally { removeDir(dir); }
  await assert.rejects(startServer({root: dir, dir, quiet: true}), /either dir .* or root/);
});

test('an upgrade or a rollback takes effect on the next request, with the new release\'s headers, and no restart', async () => {
  const r = await makeRoot(['1.0.0']);
  const s = await serve(r.root);
  try {
    const version = async () => (await (await fetch(s.url('/version.json'))).json()).version;
    const probe = async () => { const res = await fetch(s.url('/manifest.webmanifest')); await res.arrayBuffer(); return res.headers.get('x-probe'); };
    assert.equal(await version(), '1.0.0'); assert.equal(await probe(), '1.0.0');
    await upgrade({root: r.root, source: await makeRelease({dir: path.join(r.base, 'next'), version: '1.1.0', target: 'runkit', commit: commitOf(2)}).then((f) => { const app = path.join(f, 'app'); fs.writeFileSync(path.join(app, 'index.html'), pageOf('1.1.0', SHIPPED['1.1.0'])); fs.writeFileSync(path.join(app, '_headers'), toPagesHeaders() + '\n/manifest.webmanifest\n  X-Probe: 1.1.0\n'); return f; })});
    assert.equal(await version(), '1.1.0', 'the next request is answered by the other release');
    assert.equal(await probe(), '1.1.0', 'and its headers apply');
    await rollback({root: r.root});
    assert.equal(await version(), '1.0.0'); assert.equal(await probe(), '1.0.0');
    // the pointer rewritten by hand works the same way
    const record = JSON.parse(fs.readFileSync(path.join(r.root, 'current.json'), 'utf8'));
    put(path.join(r.root, 'current.json'), {...record, release: '1.1.0-runkit', version: '1.1.0', commit: commitOf(2), previous: record.release});
    assert.equal(await version(), '1.1.0');
  } finally { s.server.close(); removeDir(r.base); }
});

test('a current.json that becomes unusable keeps the live release and says so once', async () => {
  const r = await makeRoot(['1.0.0']);
  const s = await serve(r.root);
  try {
    put(path.join(r.root, 'current.json'), '{ not json');
    for (let i = 0; i < 3; i++) assert.equal((await (await fetch(s.url('/version.json'))).json()).version, '1.0.0');
    assert.equal(s.lines.length, 1); assert.match(s.lines[0], /current\.json cannot be used/);
  } finally { s.server.close(); removeDir(r.base); }
});

// ---- item 2: the operator's settings in the page -----------------------------------------------------------------------------------------------------
const OWN = {format: 'plc-app-config/1', modelSources: [{id: 'mine', label: 'Mine <b>', base: '/models/'}]};

test('config/app-config.json replaces the APP_CONFIG script exactly as the build writes it, and nothing else changes', withRoot(['1.0.0'], {}, async (c) => {
  const shippedPage = fs.readFileSync(path.join(c.appDir, 'index.html'), 'utf8');
  const before = {sw: await text(fetch(c.url('/sw.js'))), main: await text(fetch(c.url(`/releases/${c.commit}/assets/main.js`)))};
  const plainHead = await fetch(c.url('/'), {method: 'HEAD'});
  const plainEtag = plainHead.headers.get('etag');
  put(path.join(c.root, 'config', 'app-config.json'), OWN);
  const mod = await module_(c.appDir, c.commit, 'runtime/config/app-config.mjs');
  const shippedElement = `<script>window.APP_CONFIG=${JSON.stringify({format: 'plc-app-config/1', modelSources: [{id: 'shipped', label: 'Shipped', base: SHIPPED['1.0.0']}], overridden: false})};</script>`;
  assert.ok(shippedPage.includes(shippedElement));
  const element = appElement(mod, [{id: 'shipped', label: 'Shipped', base: SHIPPED['1.0.0']}], OWN);
  assert.match(element, /"overridden":true/); assert.ok(element.includes('\\u003cb>'), '< is escaped in the page');
  for (const p of ['/', '/index.html']) {
    const res = await fetch(c.url(p));
    const body = await res.text();
    assert.equal(body, shippedPage.replace(shippedElement, () => element), p + ': the page is the shipped one with that one element replaced');
    assert.equal(res.headers.get('content-length'), String(Buffer.byteLength(body)));
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    const etag = res.headers.get('etag');
    assert.ok(etag && etag !== plainEtag);
    const head = await fetch(c.url(p), {method: 'HEAD'});
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(body))); assert.equal(await head.text(), '');
    const again = await fetch(c.url(p), {headers: {'If-None-Match': etag}});
    assert.equal(again.status, 304); assert.equal(await again.text(), '');
    const old = await fetch(c.url(p), {headers: {'If-None-Match': plainEtag}});
    assert.equal(old.status, 200, 'the ETag of the shipped page does not match the new page'); assert.equal(await old.text(), body);
  }
  assert.equal(await text(fetch(c.url('/sw.js'))), before.sw, 'no other file is rewritten');
  assert.equal(await text(fetch(c.url(`/releases/${c.commit}/assets/main.js`))), before.main);
  assert.equal(await text(fetch(c.url('/version.json'))), fs.readFileSync(path.join(c.appDir, 'version.json'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(c.appDir, 'index.html'), 'utf8'), shippedPage, 'nothing is written into the release');
  assert.deepEqual(c.lines, []);
}));

test('config/site.json replaces the SITE_LINKS script with the normalised manifest', withRoot(['1.0.0'], {}, async (c) => {
  const shippedPage = fs.readFileSync(path.join(c.appDir, 'index.html'), 'utf8');
  const raw = {format: 'plc-site/1', pages: {help: '/my-help/', privacy: 'https://privacy.test/p'}, site: {url: 'https://mine.test/'}};
  put(path.join(c.root, 'config', 'site.json'), raw);
  const mod = await module_(c.appDir, c.commit, 'chat/site/site-links.mjs');
  const normalized = mod.normalizedSiteLinks(raw);
  assert.deepEqual(Object.keys(normalized.site).sort(), ['countsPageLoads', 'host', 'socialImage', 'url'], 'defaults are filled in');
  const shippedElement = `<script>window.SITE_LINKS=${JSON.stringify({format: 'plc-site/1', pages: {}})};</script>`;
  const body = await text(fetch(c.url('/')));
  assert.equal(body, shippedPage.replace(shippedElement, () => `<script>window.SITE_LINKS=${JSON.stringify(normalized).replace(/</g, '\\u003c')};</script>`));
  const res = await fetch(c.url('/'), {method: 'HEAD'});
  assert.equal(res.headers.get('content-length'), String(Buffer.byteLength(body)));
  const etag = res.headers.get('etag');
  assert.equal((await fetch(c.url('/'), {headers: {'If-None-Match': etag}})).status, 304);
  assert.equal(await text(fetch(c.url('/sw.js'))), fs.readFileSync(path.join(c.appDir, 'sw.js'), 'utf8'));
  // both files together
  put(path.join(c.root, 'config', 'app-config.json'), OWN);
  const both = await text(fetch(c.url('/')));
  assert.ok(both.includes('"overridden":true') && both.includes('/my-help/'));
}));

test('an operator file that is not valid stops the server at start, naming the file and the problems', async () => {
  const cases = [
    ['app-config.json', '{ nope', /not valid JSON/],
    ['app-config.json', {format: 'plc-app-config/2', modelSources: OWN.modelSources}, /format must be "plc-app-config\/1"/],
    ['app-config.json', {...OWN, color: 'red'}, /"color" is not a setting this app knows/],
    ['app-config.json', {format: OWN.format, modelSources: [{id: 'mine', label: 'Mine', base: 'http://insecure.test/'}]}, /modelSources\[0\]\.base must be an https/],
    ['app-config.json', {format: OWN.format}, /modelSources must be a list with at least one source/],
    ['site.json', '[]', /site\.json must be an object/],
    ['site.json', {format: 'plc-site/1', pages: {blog: '/blog/'}}, /"blog" is not a page this app knows/],
    ['site.json', {format: 'plc-site/1'}, /pages must be an object/]
  ];
  for (const [name, content, why] of cases) {
    const r = await makeRoot(['1.0.0']);
    try {
      const file = path.join(r.root, 'config', name);
      put(file, content);
      await assert.rejects(startServer({root: r.root, port: 0, quiet: true}), (e) => e.message.includes(file) && why.test(e.message), `${name} ${why}`);
    } finally { removeDir(r.base); }
  }
});

test('a file that becomes invalid while running is ignored with one line, the last good one stays, and fixing or removing it works', async () => {
  const r = await makeRoot(['1.0.0']);
  const s = await serve(r.root);
  const file = path.join(r.root, 'config', 'app-config.json');
  try {
    put(file, OWN);
    const good = await text(fetch(s.url('/')));
    assert.ok(good.includes('"id":"mine"'));
    put(file, {...OWN, extra: 1});
    assert.equal(await text(fetch(s.url('/'))), good, 'the last valid result is used');
    assert.equal(s.lines.length, 1); assert.match(s.lines[0], /app-config\.json was changed but cannot be used.*"extra" is not a setting/s);
    assert.equal(await text(fetch(s.url('/'))), good); await fetch(s.url('/sw.js')).then((x) => x.arrayBuffer());
    assert.equal(s.lines.length, 1, 'a second request adds no line');
    put(file, '{ broken');
    await fetch(s.url('/')).then((x) => x.arrayBuffer());
    assert.equal(s.lines.length, 2, 'a new change that is invalid is a new line');
    put(file, {format: OWN.format, modelSources: [{id: 'fixed', label: 'Fixed', base: '/m/'}]});
    const fixed = await text(fetch(s.url('/')));
    assert.ok(fixed.includes('"id":"fixed"') && !fixed.includes('"id":"mine"'));
    assert.equal(s.lines.length, 2);
    fs.rmSync(file);
    assert.equal(await text(fetch(s.url('/'))), fs.readFileSync(path.join(r.appDir, 'index.html'), 'utf8'), 'removed: the shipped setting is back');
    assert.equal((await fetch(s.url('/'))).headers.get('accept-ranges'), 'bytes', 'and the page is an ordinary file again');
  } finally { s.server.close(); removeDir(r.base); }
});

test('after a switch the overlay uses the new release\'s defaults and validators', async () => {
  const r = await makeRoot(['1.0.0']);
  const s = await serve(r.root);
  try {
    put(path.join(r.root, 'config', 'site.json'), SITE);
    assert.ok((await text(fetch(s.url('/')))).includes('/help/'));
    const folder = await makeRelease({dir: path.join(r.base, 'next'), version: '1.1.0', target: 'runkit', commit: commitOf(2)});
    fs.writeFileSync(path.join(folder, 'app', 'index.html'), pageOf('1.1.0', SHIPPED['1.1.0']));
    await upgrade({root: r.root, source: folder});
    const page = await text(fetch(s.url('/')));
    assert.ok(page.includes('<title>1.1.0</title>') && page.includes('/help/'), 'the operator\'s file is laid over the new page');
    assert.ok(page.includes(SHIPPED['1.1.0']), 'the new release\'s shipped source, not the old one\'s');
    put(path.join(r.root, 'config', 'app-config.json'), OWN);
    const own = await text(fetch(s.url('/')));
    assert.ok(own.includes('"overridden":true') && !own.includes(SHIPPED['1.1.0']));
    assert.deepEqual(s.lines, []);
  } finally { s.server.close(); removeDir(r.base); }
});

test('a page that lacks the script an operator file replaces is served as it is, with one note', async () => {
  const r = await makeRoot(['1.0.0']);
  fs.writeFileSync(path.join(r.appDir, 'index.html'), '<!doctype html><p>another build</p>');
  const s = await serve(r.root);
  try {
    put(path.join(r.root, 'config', 'app-config.json'), OWN);
    for (let i = 0; i < 2; i++) assert.equal(await text(fetch(s.url('/'))), '<!doctype html><p>another build</p>');
    assert.equal(s.lines.length, 1); assert.match(s.lines[0], /no window\.APP_CONFIG script/);
  } finally { s.server.close(); removeDir(r.base); }
});

test('the command line refuses an invalid operator file and exits 1 with the reason', async () => {
  const r = await makeRoot(['1.0.0']);
  try {
    put(path.join(r.root, 'config', 'site.json'), {format: 'plc-site/1', pages: {blog: '/b/'}});
    let status = 0, err = '';
    try { execFileSync('node', ['scripts/serve.mjs', '--root', r.root, '--port', '0'], {stdio: 'pipe'}); } catch (e) { status = e.status; err = String(e.stderr); }
    assert.equal(status, 1); assert.match(err, /site\.json cannot be used/); assert.match(err, /"blog" is not a page/);
  } finally { removeDir(r.base); }
});

