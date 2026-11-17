// The operator's tools in a real browser (docs/RUN-IT.md, stage 8 of the site-split plan): two real releases built from this tree with different versions and commits, packed with the
// project's own zip writer, installed into ONE operator folder and served by that folder's plc.mjs, never by the repository's serve.mjs. While a tab on the first build stays open:
// upgrade, roll back, break an upgrade at every step, lay the operator's settings and pages over the copy, fill models/ from a local source, check and prune.
//   node tests/e2e/operator.e2e.mjs        (E2E_PORT_OFFSET=300 if the port is taken)
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {Worker} from 'node:worker_threads';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, copyFileSync, openSync, readSync, writeSync, closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {buildRealRelease} from '../helpers/real-release.mjs';
import {listFixtures, readFixture, restoreInPage, probeInPage, project, mismatch} from '../data/lib.mjs';
const {chromium} = createRequire(import.meta.url)('playwright');

const PORT = 18611 + Number(process.env.E2E_PORT_OFFSET || 0);
const ok = (n) => console.log('PASS ' + n);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const until = async (cond, what, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await cond(); if (v) return v; await sleep(100); } throw new Error('Timed out waiting for ' + what); };
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);

const scratch = mkdtempSync(path.join(tmpdir(), 'plc-operator-e2e-'));
const work = mkdtempSync(path.join(process.cwd(), '.tmp-operator-e2e-')); // the build writes inside the repository
const root = path.join(scratch, 'plc');
const origin = `http://127.0.0.1:${PORT}`;
const children = new Set();
let browser = null, server = null, tiny = null, poller = null;

// A command run to its end, with what it printed.
const run = (args, options = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, {stdio: 'pipe', ...options});
  children.add(child);
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; }); child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (status) => { children.delete(child); resolve({status, stdout, stderr}); });
});
const plc = (...args) => run([path.join(root, 'plc.mjs'), ...args]);
const currentJson = () => readFileSync(path.join(root, 'current.json'), 'utf8');
const current = () => JSON.parse(currentJson());
const releaseDirs = () => readdirSync(path.join(root, 'releases')).sort();

// The server of the operator folder, as a person starts it.
function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'plc.mjs'), '--port', String(PORT)], {stdio: 'pipe'});
  children.add(child);
  const log = {stdout: '', stderr: '', child};
  child.stdout.on('data', (d) => { log.stdout += d; }); child.stderr.on('data', (d) => { log.stderr += d; });
  child.on('exit', () => children.delete(child));
  return until(() => /Serving /.test(log.stdout) || child.exitCode !== null, 'the server to start', 15000).then(() => { assert.equal(child.exitCode, null, 'the server did not start: ' + log.stderr); return log; });
}

// A second small server on this computer: it is a model source, and the place fetch-models downloads from. Range is supported; it counts what it was asked for.
const modelFiles = {
  'tiny/r1/a.bin': Buffer.from(Array.from({length: 3000}, (_, i) => (i * 7 + 1) % 251)),
  'tiny/r1/b.bin': Buffer.from(Array.from({length: 4096}, (_, i) => (i * 13 + 5) % 247)),
  'tiny/r1/sub/c.bin': Buffer.from(Array.from({length: 5000}, (_, i) => (i * 3 + 9) % 239))
};
const asked = [];
const startTiny = () => new Promise((resolve) => {
  const s = createServer((req, res) => {
    asked.push(req.url);
    const file = modelFiles[decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/m\//, '')];
    if (!file) { res.writeHead(404); return res.end(); }
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (!m) { res.writeHead(200, {'Content-Length': file.length, 'Accept-Ranges': 'bytes'}); return res.end(file); }
    const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), file.length - 1) : file.length - 1;
    res.writeHead(206, {'Content-Range': `bytes ${start}-${end}/${file.length}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes'});
    res.end(file.subarray(start, end + 1));
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});

// A loop that asks the server for /version.json, / and a file of the live build every 50 ms, in its own thread so that an upgrade that blocks this one cannot stop it.
const pollerSource = `
const {parentPort, workerData} = require('node:worker_threads');
let stop = false, allowed = workerData.allowed, count = 0;
const failures = [];
parentPort.on('message', (m) => { if (m.allowed) allowed = m.allowed; if (m.ping) parentPort.postMessage({count, failures: failures.slice()}); if (m.stop) stop = true; });
(async () => {
  while (!stop) {
    for (const p of ['/version.json', '/', '/releases/' + workerData.commit + '/release.json']) {
      try {
        const r = await fetch(workerData.origin + p); const text = await r.text(); count++;
        if (r.status !== 200) failures.push(p + ' answered ' + r.status);
        else if (p === '/version.json') { const v = JSON.parse(text).version; if (!allowed.includes(v)) failures.push('/version.json said ' + v + ', expected ' + allowed.join(' or ')); }
      } catch (error) { failures.push(p + ' failed: ' + error.message); }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  parentPort.postMessage({done: true, count, failures});
})();`;
function startPoller(allowed) {
  const worker = new Worker(pollerSource, {eval: true, workerData: {origin, commit: A, allowed}});
  const ask = (message, wanted) => new Promise((resolve) => { const on = (m) => { if (wanted(m)) { worker.off('message', on); resolve(m); } }; worker.on('message', on); worker.postMessage(message); });
  return {allow: (versions) => worker.postMessage({allowed: versions}), ping: () => ask({ping: true}, (m) => !m.done), stop: async () => { const last = await ask({stop: true}, (m) => m.done); await worker.terminate(); return last; }}; // its message listener would keep the thread, and so this process, alive
}

const ready = async (page) => { await page.waitForSelector('#messageInput'); await page.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, {timeout: 30000}); await page.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const probe = async (page) => project(await page.evaluate(probeInPage));
// sessionStorage belongs to one tab by design, so a new tab is judged on what a person keeps: local storage and documents
const kept = ({local, docs}) => ({local, docs});
const buildOf = (page) => page.evaluate(() => window.APP_BUILD);
const hashFiles = (page, commit, files) => page.evaluate(async ({commit, files}) => {
  const out = [];
  for (const f of files) { const r = await fetch(`/releases/${commit}/${f}`); const d = await crypto.subtle.digest('SHA-256', await r.arrayBuffer()); out.push({f, status: r.status, sha: [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')}); }
  return out;
}, {commit, files});
const ownFiles = ['chat/stream.mjs', 'runtime/config/app-config.mjs'];
const releaseJson = async (commit) => { const r = await fetch(`${origin}/releases/${commit}/release.json`); assert.equal(r.status, 200, `/releases/${commit}/release.json is served`); return r.json(); };
async function loadsItsOwnFiles(page, commit, what) {
  const pins = Object.fromEntries((await releaseJson(commit)).files.map((f) => [f.path, f.sha256]));
  for (const f of await hashFiles(page, commit, ownFiles)) {
    assert.equal(f.status, 200, `${what}: ${f.f} loads`);
    assert.equal(f.sha, pins[f.f], `${what}: ${f.f} has the bytes release.json names`);
  }
}
const settingsText = async (page, section) => {
  await page.evaluate((s) => window.plcShell.openSettings(s), section);
  await page.waitForSelector('#settingsPage', {state: 'visible'});
  await page.waitForTimeout(400);
  return page.locator('#settingsPage').innerText();
};
const closeSettings = (page) => page.click('button[aria-label="Close settings"]');

try {
  // ---- the releases ---------------------------------------------------------------------------------------------------------------------------------
  const rel = {};
  for (const [key, version, commit] of [['a', '0.0.1', A], ['b', '0.0.2', B], ['c', '0.0.3', C]]) rel[key] = await buildRealRelease({version, commit, dir: path.join(scratch, 'release-' + key), workDir: work});
  ok('three real releases are built from this tree: 0.0.1, 0.0.2 and 0.0.3, each with its own build folder');

  const fixtures = listFixtures();
  assert.ok(fixtures.length > 0, 'there is a data snapshot in tests/fixtures/data');
  const snapshot = readFixture(fixtures[fixtures.length - 1]);

  // ---- 1. install release A with the real command line, serve, put data in ----------------------------------------------------------------------------
  let r = await run([path.join(rel.a.folder, 'serve.mjs'), '--upgrade', rel.a.zip, '--root', root]);
  assert.equal(r.status, 0, 'the first install: ' + r.stdout + r.stderr);
  assert.match(r.stdout, /Installed 0\.0\.1-runkit/);
  assert.equal(current().release, '0.0.1-runkit');
  assert.equal(current().previous, null);
  const before0 = currentJson();
  r = await plc('--rollback');
  assert.notEqual(r.status, 0, 'a rollback with no earlier release is refused');
  assert.match(r.stderr, /nothing to go back to/i);
  assert.equal(currentJson(), before0, 'and changes nothing');
  ok('release A installs into an empty root with serve.mjs --upgrade; --rollback with nothing before it is refused and changes nothing');

  server = await startServer();
  browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, serviceWorkers: 'allow'});
  const tabA = await context.newPage();
  await tabA.goto(origin + '/');
  await ready(tabA);
  assert.equal(await tabA.evaluate(() => crossOriginIsolated), true, 'the page is cross-origin isolated');
  await tabA.waitForFunction(async () => Boolean(await navigator.serviceWorker.getRegistration()), null, {timeout: 30000});
  await tabA.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  assert.equal((await buildOf(tabA)).version, '0.0.1');
  assert.equal((await buildOf(tabA)).commit, A);
  await tabA.goto(origin + '/version.json'); // a blank page of the same origin: the data goes in before the app has opened anything
  await tabA.evaluate(restoreInPage, snapshot.plain.storage);
  await tabA.goto(origin + '/');
  await ready(tabA);
  await tabA.waitForTimeout(1500);
  const before = await probe(tabA);
  const bad = mismatch(snapshot.plain.expected, await tabA.evaluate(probeInPage).then(project));
  assert.equal(bad, null, 'the browser holds the snapshot: ' + bad);
  assert.ok(Object.keys(before.local).length > 3, 'and it holds real data');
  ok('release A: cross-origin isolated, service worker registered, APP_BUILD.version 0.0.1, and the snapshot ' + snapshot.name + ' is in the browser');

  // ---- 2. upgrade to B while tab A stays open -------------------------------------------------------------------------------------------------------
  // the negative control first: a wrong checksum is refused and nothing changes
  const bad_ = path.join(scratch, 'wrong-sum');
  mkdirSync(bad_);
  copyFileSync(rel.b.zip, path.join(bad_, path.basename(rel.b.zip)));
  writeFileSync(path.join(bad_, 'SHA256SUMS'), `${'0'.repeat(64)}  ${path.basename(rel.b.zip)}\n`);
  const treeBefore = [currentJson(), releaseDirs().join(',')];
  r = await plc('--upgrade', path.join(bad_, path.basename(rel.b.zip)));
  assert.notEqual(r.status, 0, 'a zip with a wrong checksum is refused');
  assert.deepEqual([currentJson(), releaseDirs().join(',')], treeBefore, 'and nothing changes');
  ok('a zip whose checksum is wrong is refused, and current.json and releases/ are as they were');

  await tabA.evaluate(() => { window.__marker = 1; });
  let navigations = 0;
  tabA.on('framenavigated', (f) => { if (f === tabA.mainFrame()) navigations++; });
  r = await plc('--upgrade', rel.b.zip); // the server is NOT restarted
  assert.equal(r.status, 0, 'the upgrade: ' + r.stdout + r.stderr);
  assert.equal(current().release, '0.0.2-runkit');
  assert.equal(await tabA.evaluate(() => window.__marker), 1, 'tab A was not reloaded');
  assert.equal(navigations, 0, 'and did not navigate');
  await loadsItsOwnFiles(tabA, A, 'tab A after the upgrade');
  assert.equal((await fetch(`${origin}/releases/${A}/release.json`)).status, 200, 'the server still serves the files of build A');
  const index = await (await fetch(origin + '/releases/index.json')).json();
  assert.equal(index.current, B);
  assert.ok([index.current, ...index.retained].includes(A) && [index.current, ...index.retained].includes(B), '/releases/index.json lists both builds: ' + JSON.stringify(index));
  await tabA.evaluate(() => window.dispatchEvent(new Event('plc-check-update')));
  await tabA.waitForSelector('#updateNotice', {timeout: 15000});
  const notice = await tabA.locator('#updateNotice').innerText();
  assert.ok(/new version of Private Local Chat is ready/.test(notice) && /Reload/.test(notice) && /Later/.test(notice), 'tab A offers the new version with Reload and Later: ' + notice);
  assert.equal(await tabA.evaluate(() => window.__marker), 1);
  assert.equal(navigations, 0);
  assert.deepEqual(await probe(tabA), before, 'tab A holds the same data');
  ok('upgrade to B with tab A open: no restart, no reload, A\'s own files still load, the notice is offered, the data is unchanged');

  const tabB = await context.newPage();
  await tabB.goto(origin + '/');
  await ready(tabB);
  assert.equal((await buildOf(tabB)).version, '0.0.2');
  assert.equal((await buildOf(tabB)).commit, B);
  await tabB.waitForTimeout(1500);
  assert.deepEqual(kept(await probe(tabB)), kept(before), 'tab B holds the same data');
  ok('a new tab runs 0.0.2 and its data equals the snapshot\'s');

  // ---- 3. roll back ---------------------------------------------------------------------------------------------------------------------------------
  r = await plc('--rollback');
  assert.equal(r.status, 0, 'the rollback: ' + r.stdout + r.stderr);
  await loadsItsOwnFiles(tabB, B, 'tab B after the rollback');
  assert.equal((await fetch(`${origin}/releases/${B}/release.json`)).status, 200, 'the files of build B are still served');
  const tabC = await context.newPage();
  await tabC.goto(origin + '/');
  await ready(tabC);
  assert.equal((await buildOf(tabC)).version, '0.0.1');
  await tabC.waitForTimeout(1500);
  assert.deepEqual(kept(await probe(tabC)), kept(before), 'tab C holds the same data');
  assert.equal(current().release, '0.0.1-runkit');
  assert.equal(current().previous, '0.0.2-runkit');
  assert.equal(await tabA.evaluate(() => window.__marker), 1, 'tab A is still the same page');
  ok('rollback: tab B keeps loading its own build, a new tab runs 0.0.1, the data is identical, current.json says 0.0.1 with 0.0.2 before it');
  await tabB.close(); await tabC.close();

  // ---- 4. an upgrade that stops at each step, while the site is being asked all the time -------------------------------------------------------------------
  const {upgrade} = await import(pathToFileURL(path.join(root, 'releases', current().release, 'operator.mjs')).href);
  poller = startPoller(['0.0.1']);
  const liveBefore = currentJson();
  const askedAtStart = (await poller.ping()).count;
  for (const step of ['extract', 'verify', 'carry', 'check', 'rename', 'switch-before']) {
    await assert.rejects(upgrade({root, source: rel.c.zip, hooks: {[step]: () => { throw new Error('injected stop at ' + step); }}}), new RegExp('injected stop at ' + step), `the upgrade stops at ${step}`);
    assert.equal(currentJson(), liveBefore, `after a stop at ${step} the live release is unchanged`);
    const seen = await poller.ping();
    assert.deepEqual(seen.failures, [], `after a stop at ${step} not one request failed`);
    assert.equal((await (await fetch(origin + '/version.json')).json()).version, '0.0.1');
  }
  const askedAtEnd = (await poller.ping()).count;
  assert.ok(askedAtEnd - askedAtStart >= 30, `the site was asked while the upgrades ran: ${askedAtEnd - askedAtStart} requests`);
  poller.allow(['0.0.1', '0.0.3']);
  r = await plc('--upgrade', rel.c.zip);
  assert.equal(r.status, 0, 'the upgrade that finishes the work: ' + r.stdout + r.stderr);
  const summary = await poller.stop();
  poller = null;
  assert.deepEqual(summary.failures, [], 'not one request failed or named the wrong version in the whole time: ' + summary.failures.slice(0, 5).join('; '));
  assert.equal(current().release, '0.0.3-runkit');
  assert.equal(current().previous, '0.0.1-runkit');
  assert.equal((await (await fetch(origin + '/version.json')).json()).version, '0.0.3');
  assert.deepEqual(releaseDirs().filter((d) => d.startsWith('.')), [], 'no .incoming folder is left');
  ok(`an upgrade stopped at extract, verify, carry, check, rename and switch-before never changed the live release; ${summary.count} requests all answered; the next upgrade completed`);

  // ---- 5. the operator's settings and pages, with no restart ----------------------------------------------------------------------------------------
  await tabA.close();
  tiny = await startTiny();
  const tinyBase = `http://127.0.0.1:${tiny.address().port}`;
  const labSource = {format: 'plc-app-config/1', modelSources: [{id: 'lab', label: 'Lab mirror', base: 'https://lab-mirror.example/models/'}]}; // a source must be https or a path on the copy: checkAppConfig refuses http even for 127.0.0.1, and nothing asks this host unless a download starts
  mkdirSync(path.join(root, 'config'), {recursive: true});
  mkdirSync(path.join(root, 'pages', 'privacy'), {recursive: true});
  writeFileSync(path.join(root, 'config', 'app-config.json'), JSON.stringify(labSource, null, 2));
  writeFileSync(path.join(root, 'config', 'site.json'), JSON.stringify({format: 'plc-site/1', pages: {help: '/help/', privacy: '/privacy/'}}, null, 2));
  writeFileSync(path.join(root, 'pages', 'privacy', 'index.html'), '<!doctype html><title>Privacy</title><h1>Privacy of this copy</h1>');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/');
  await ready(page);
  let config = await page.evaluate(() => window.APP_CONFIG);
  assert.equal(config.modelSources[0].base, labSource.modelSources[0].base);
  assert.equal(config.overridden, true);
  let text = await settingsText(page, 'models');
  assert.match(text, /Model source/);
  assert.match(text, /Model files come from[\s\S]*Lab mirror/);
  assert.ok(text.includes('This copy is updated by whoever hosts it.'), 'Settings, Models has the line about who updates this copy: ' + text.slice(-600));
  await closeSettings(page);
  const privacy = await fetch(origin + '/privacy/');
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /Privacy of this copy/);
  text = await settingsText(page, 'about');
  assert.match(text, /^Privacy\b/m, 'Settings has the Privacy row');
  assert.equal(await page.locator('#settingsPage a[href="/privacy/"]').count(), 1, 'and it links to /privacy/');
  await closeSettings(page);
  const served = Buffer.from(await (await fetch(origin + '/sw.js')).arrayBuffer());
  assert.ok(served.equals(readFileSync(path.join(root, 'releases', current().release, 'app', 'sw.js'))), '/sw.js is the release\'s, byte for byte');
  assert.equal(server.stderr, '', 'the server has said nothing so far');
  // a file that becomes invalid while running: the last good one stays in use, and one line is printed
  writeFileSync(path.join(root, 'config', 'app-config.json'), JSON.stringify({format: 'plc-app-config/1', modelSources: [{id: 'Bad Id', label: '', base: 'ftp://nowhere'}]}));
  await page.reload(); await ready(page);
  await page.reload(); await ready(page);
  config = await page.evaluate(() => window.APP_CONFIG);
  assert.equal(config.modelSources[0].base, labSource.modelSources[0].base, 'the last good settings are still in use');
  await until(() => server.stderr.trim() !== '', 'the server to say that the file cannot be used', 5000);
  assert.equal(server.stderr.trim().split('\n').filter((l) => /app-config\.json/.test(l)).length >= 1, true);
  assert.match(server.stderr, /config\/app-config\.json was changed but cannot be used/);
  assert.equal(server.stderr.split('\n').filter((l) => /^config\/app-config\.json was changed/.test(l)).length, 1, 'one line, not one per request');
  writeFileSync(path.join(root, 'config', 'app-config.json'), JSON.stringify(labSource, null, 2)); // the operator fixes it
  ok('operator settings: the page names the operator\'s source and links, Settings shows Lab mirror, the host line and Privacy, /privacy/ is the operator\'s page, sw.js is untouched, a broken file is reported once and ignored');

  // ---- 6. models from this computer -----------------------------------------------------------------------------------------------------------------
  const manifest = path.join(scratch, 'tiny-models.json');
  writeFileSync(manifest, JSON.stringify({format: 'plc-models/1', tiers: {tiny: Object.entries(modelFiles).map(([p, b]) => ({path: p, bytes: b.length, sha256: sha256(b)}))}, voices: {}, embedding: []}, null, 2));
  const fetchTool = path.join(root, 'releases', current().release, 'fetch-models.mjs');
  const configBefore = readFileSync(path.join(root, 'config', 'app-config.json'));
  r = await run([fetchTool, '--root', root, '--manifest', manifest, '--tier', 'tiny', '--from', `${tinyBase}/m/`, '--use-local']);
  assert.equal(r.status, 0, 'fetch-models: ' + r.stdout + r.stderr);
  for (const [p, bytes] of Object.entries(modelFiles)) assert.ok(readFileSync(path.join(root, 'models', p)).equals(bytes), p + ' is under models/ with the right bytes');
  assert.ok(readFileSync(path.join(root, 'config', 'app-config.json')).equals(configBefore), 'config/app-config.json was not overwritten');
  assert.match(r.stdout, /this-host/, 'the tool prints the snippet instead');
  rmSync(path.join(root, 'config', 'app-config.json'));
  r = await run([fetchTool, '--root', root, '--manifest', manifest, '--tier', 'tiny', '--from', `${tinyBase}/m/`, '--use-local']);
  assert.equal(r.status, 0, 'fetch-models again: ' + r.stdout + r.stderr);
  const made = JSON.parse(readFileSync(path.join(root, 'config', 'app-config.json'), 'utf8'));
  assert.equal(made.modelSources[0].base, '/models/');
  await page.reload(); await ready(page);
  config = await page.evaluate(() => window.APP_CONFIG);
  assert.equal(config.modelSources[0].base, '/models/');
  const probePath = 'tiny/r1/sub/c.bin';
  const got = await page.evaluate(async (p) => {
    const r = await fetch('/models/' + p); const buf = await r.arrayBuffer(); const d = await crypto.subtle.digest('SHA-256', buf);
    const part = await fetch('/models/' + p, {headers: {Range: 'bytes=10-19'}});
    return {status: r.status, sha: [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''), partStatus: part.status, partLength: (await part.arrayBuffer()).byteLength};
  }, probePath);
  assert.equal(got.status, 200);
  assert.equal(got.sha, sha256(modelFiles[probePath]), 'the page gets the bytes with the right hash from /models/');
  assert.equal(got.partStatus, 206, 'a Range request is answered with 206');
  assert.equal(got.partLength, 10);
  text = await settingsText(page, 'models');
  assert.match(text, /Model files come from[\s\S]*This computer/, 'Settings names "This computer": ' + text.slice(-700));
  await closeSettings(page);
  assert.deepEqual(errors, [], 'the page reported errors: ' + errors.join(' | '));
  ok('fetch-models fills models/ from a local source, leaves an existing config alone, --use-local creates it when missing, the app serves /models/ with Range and says "This computer"');

  // ---- 7. check and prune ---------------------------------------------------------------------------------------------------------------------------
  r = await plc('--check');
  assert.equal(r.status, 0, 'the healthy root checks out: ' + r.stdout + r.stderr);
  const live = current();
  const buildDir = path.join(root, 'releases', live.release, 'app', 'releases', live.commit);
  const target = path.join(buildDir, 'chat', 'stream.mjs');
  const fd = openSync(target, 'r+'), one = Buffer.alloc(1);
  readSync(fd, one, 0, 1, 0);
  writeSync(fd, Buffer.from([one[0] ^ 1]), 0, 1, 0); closeSync(fd);
  r = await plc('--check');
  assert.notEqual(r.status, 0, 'a changed byte in the current build fails the check');
  assert.match(r.stdout, /stream\.mjs/);
  const fd2 = openSync(target, 'r+'); writeSync(fd2, one, 0, 1, 0); closeSync(fd2);
  r = await plc('--check');
  assert.equal(r.status, 0, 'and it passes again when the byte is put back: ' + r.stdout);
  const stateBefore = currentJson();
  assert.deepEqual(releaseDirs(), ['0.0.1-runkit', '0.0.2-runkit', '0.0.3-runkit']);
  r = await plc('--prune', '--keep', '1');
  assert.equal(r.status, 0, 'prune: ' + r.stdout + r.stderr);
  assert.deepEqual(releaseDirs(), ['0.0.1-runkit', '0.0.3-runkit'], 'the current and the previous release are kept, the older one is removed');
  assert.equal(currentJson(), stateBefore);
  assert.equal((await fetch(origin + '/version.json')).status, 200);
  ok('--check passes, fails on one changed byte and passes when it is put back; --prune --keep 1 keeps the current and the previous release');

  console.log('ALL PASS');
} catch (error) {
  console.error('FAIL ' + (error.stack || error));
  if (server) console.error('--- the server said ---\nstdout: ' + server.stdout + '\nstderr: ' + server.stderr);
  process.exitCode = 1;
} finally {
  if (poller) await poller.stop().catch(() => {});
  await browser?.close().catch(() => {});
  for (const child of children) child.kill();
  if (tiny) { tiny.closeAllConnections(); await new Promise((resolve) => tiny.close(resolve)); }
  rmSync(scratch, {recursive: true, force: true});
  rmSync(work, {recursive: true, force: true});
}
