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

