// A newer store, an older vault, then the newer build again, in a real browser on ONE origin and ONE profile per phase (docs/DATA-COMPATIBILITY.md).
//   node scripts/e2e.mjs vault-transition        (builds two trees under PLC_TRANSITION_SCRATCH or a temp folder; profiles under PLC_E2E_PROFILE_ROOT)
// OLD reader = git 0b0ef275 built from `git archive`, byte for byte. NEW build = this working tree with ONE source transform: chat/vault/key-classes.mjs gets the two supplied new-store
// classes (plc.characters.v1, plc.encounters.v1: local, user, format 1), because production key ownership is added at final integration. Both are served on the same port in turn,
// so the profile's localStorage and IndexedDB belong to one origin. Synthetic data only.
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { newProfileDir } from './profile-root.mjs';
import { assert } from './harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const OLD_REV = '0b0ef27530a25e9d218ecae5460066162b07a6da', CH = 'plc.characters.v1', EN = 'plc.encounters.v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 18471 + Number(process.env.E2E_PORT_OFFSET || 0), ORIGIN = `http://127.0.0.1:${PORT}`;
const scratch = process.env.PLC_TRANSITION_SCRATCH || fs.mkdtempSync(path.join(os.tmpdir(), 'plc-transition-e2e-'));
const ok = (n) => console.log('PASS ' + n);
const chars = JSON.stringify({ v: 1, records: [{ id: 'c-1', name: 'Synthetic Pip', text: 'SYNTH-CHAR-1' }] });
const encs = JSON.stringify({ v: 1, encounters: [{ id: 'e-1', note: 'SYNTH-ENC-1' }] });
const thread = [{ id: 't0', title: 'Synthetic chat', messages: [{ role: 'user', content: 'SYNTH-CHAT-MARK' }] }];
const PASS = 'correct horse';

// ---- the two trees ----------------------------------------------------------------------------------------------------------------------------------------------------
function prepare() {
  const oldDir = path.join(scratch, 'old-src'), newDir = path.join(scratch, 'new-src');
  for (const d of [oldDir, newDir]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  const tar = path.join(scratch, 'old.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, OLD_REV], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', oldDir]);
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  for (const f of files) { const from = path.join(ROOT, f); if (!fs.existsSync(from) || fs.statSync(from).isDirectory()) continue; fs.mkdirSync(path.dirname(path.join(newDir, f)), { recursive: true }); fs.copyFileSync(from, path.join(newDir, f)); }
  const table = path.join(newDir, 'chat/vault/key-classes.mjs'), anchor = '  "plc.shell.pins.v1": { store: "local", class: "user", format: 1 },\n';
  const text = fs.readFileSync(table, 'utf8'); assert(text.includes(anchor), 'key table anchor');
  fs.writeFileSync(table, text.replace(anchor, anchor + [CH, EN].map((k) => `  "${k}": { store: "local", class: "user", format: 1 },\n`).join('')));
  for (const d of [oldDir, newDir]) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(d, 'node_modules'));
  for (const d of [oldDir, newDir]) { // the build reads a commit date from git: a throwaway repository inside the scratch folder
    const g = (...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
    g('init', '-q'); g('add', '-A', '--', '.', ':!node_modules'); g('-c', 'user.name=scratch', '-c', 'user.email=scratch@localhost', 'commit', '-q', '--no-verify', '-m', 'chore(scratch): tree for the browser proof', '-m', 'A throwaway commit so the build can read a date.');
  }
  const sha = (f) => execFileSync('sha256sum', [f], { encoding: 'utf8' }).split(' ')[0];
  console.log('SOURCE old key-classes sha256 ' + sha(path.join(oldDir, 'chat/vault/key-classes.mjs')) + ' (git ' + OLD_REV.slice(0, 8) + ')');
  console.log('SOURCE new key-classes sha256 ' + sha(table) + ' (working tree + the two supplied classes)');
  for (const f of ['vault-store.mjs', 'vault-control.mjs']) console.log('SOURCE new ' + f + ' sha256 ' + sha(path.join(newDir, 'chat/vault', f)) + ' = working tree ' + (sha(path.join(ROOT, 'chat/vault', f)) === sha(path.join(newDir, 'chat/vault', f))));
  const build = (dir, commit) => execFileSync('node', ['scripts/build.mjs'], { cwd: dir, stdio: 'pipe', env: { ...process.env, DEPLOY_BRANCH: 'local', GITHUB_SHA: commit } });
  build(oldDir, OLD_REV); build(newDir, 'f'.repeat(40));
  return { oldDir, newDir };
}
async function serve(dir) {
  const web = spawn('node', ['scripts/serve.mjs'], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(ORIGIN + '/')).ok) break; } catch { /* starting */ } await sleep(100); }
  return async () => { web.kill(); await new Promise((r) => web.once('exit', r)); await sleep(200); };
}

// ---- helpers ---------------------------------------------------------------------------------------------------------------------------------------------------------
const errors = [];
async function open(profile, { init = null } = {}) {
  const context = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebGPU|webgpu|simulated interruption/i.test(m.text())) errors.push(m.text()); });
  if (init) await page.addInitScript(typeof init === 'string' ? { content: init } : init);
  return { context, page };
}
const probe = () => { window.__probe = {}; window.addEventListener('plc:vault-recovery', (e) => { window.__probe.recoveryAt = performance.now(); window.__probe.detail = e.detail; }); let b; Object.defineProperty(window, '__plcBooted', { configurable: true, get: () => b, set: (v) => { b = v; if (v === true && window.__probe.bootedAt == null) window.__probe.bootedAt = performance.now(); } }); };
const failFirstAppend = () => { let n = 0; const add = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function (...a) { if (this.name === 'log' && ++n === 1) throw new DOMException('simulated interruption', 'AbortError'); return add.apply(this, a); }; };
const ready = async (page) => { await page.waitForSelector('#messageInput'); await page.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 30000 }); await page.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const unlock = async (page) => { await page.waitForSelector('#lockScreen', { state: 'visible', timeout: 30000 }); await page.fill('#unlockPass', PASS); await page.press('#unlockPass', 'Enter'); await page.waitForSelector('#lockScreen', { state: 'hidden', timeout: 30000 }); await ready(page); };
const openSecurity = async (page) => { if (!await page.locator('#settingsPage').isVisible()) { await page.click('button[aria-label="This device menu"]'); await page.click('.shell-pop-row:has-text("Settings")'); } await page.click('.settings-nav-item[data-section="security"]'); await page.click('.set-row:has-text("App lock") button'); };
const closeSettings = async (page) => { if (await page.locator('#settingsPage').isVisible()) await page.click('button[aria-label="Close settings"]'); };
const text = (page, re) => page.waitForFunction((s) => new RegExp(s).test(document.body.innerText), re.source, { timeout: 20000 });
const raw = (page, k) => page.evaluate((k) => localStorage.getItem(k), k);
const VS = "'/releases/'+window.APP_BUILD.commit+'/chat/vault/vault-store.mjs'";
const facade = (page, k) => page.evaluate(`import(${VS}).then((m) => m.appLocal.getItem(${JSON.stringify(k)}))`);
const recovery = (page) => page.evaluate(`import(${VS}).then((m) => { const r = m.app.recovery; return r ? JSON.parse(JSON.stringify(r)) : null; })`);
const logCount = (page) => page.evaluate(async () => { const db = await new Promise((res, rej) => { const r = indexedDB.open('plc-vault'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); const n = await new Promise((res, rej) => { const q = db.transaction('log').objectStore('log').count(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); db.close(); return n; });

/** The OLD reader's UI turns the vault on, removes what it knows, and the synthetic new stores stay raw. */
async function oldReaderEnables(oldDir, profile) {
  const stop = await serve(oldDir); const { context, page } = await open(profile);
  await page.goto(ORIGIN + '/'); await page.waitForSelector('#messageInput');
  await page.evaluate(([ch, en, th]) => { localStorage.setItem('plc.lockSplash.v1', 'off'); localStorage.setItem('plc.inferenceMode.v1', 'api'); localStorage.setItem('plc.prefs.v1', '{"enterSends":true}'); localStorage.setItem('chatThreads', JSON.stringify(th)); localStorage.setItem('plc.characters.v1', ch); localStorage.setItem('plc.encounters.v1', en); }, [chars, encs, thread]);
  await page.reload(); await ready(page);
  await openSecurity(page); await page.check('#lockEncrypt'); await page.fill('#lockNew1', PASS); await page.fill('#lockNew2', PASS); await page.click('.app-dialog button:has-text("Lock the app")');
  await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")', { timeout: 60000 }); await page.click('.app-dialog button:has-text("Remove it")');
  await page.waitForFunction(() => !localStorage.getItem('chatThreads'), null, { timeout: 30000 });
  assert(await raw(page, CH) === chars && await raw(page, EN) === encs, 'the old reader leaves the unknown synthetic stores as they were');
  assert(await raw(page, 'plc.vault.v1') && !(await raw(page, 'chatThreads')) && !(await raw(page, 'plc.prefs.v1')), 'the old reader enabled the vault and removed the plaintext it knows');
  const n = await logCount(page);
  await context.close(); await stop();
  return n;
}

const { oldDir, newDir } = prepare();
const runs = { transition: newProfileDir('vault-transition-a'), readonly: newProfileDir('vault-transition-b'), interrupted: newProfileDir('vault-transition-c') };
let stop = null, ctxs = [];
try {
  // ---- phase 1: transition, cleanup that preserves the copy, conflicts ------------------------------------------------------------------------------------------------
  await oldReaderEnables(oldDir, runs.transition); ok('old reader ignores the synthetic new stores; its UI enables the vault and removes the known plaintext');
  stop = await serve(newDir);
  let { context, page } = await open(runs.transition, { init: '(' + probe + ')();' }); ctxs.push(context);
  await page.goto(ORIGIN + '/');
  await page.waitForSelector('#lockScreen', { state: 'visible', timeout: 30000 });
  assert(await raw(page, CH) === chars, 'before unlock the raw store is untouched');
  await page.fill('#unlockPass', PASS); await page.press('#unlockPass', 'Enter'); await page.waitForSelector('#lockScreen', { state: 'hidden', timeout: 30000 }); await ready(page);
  let rec = await recovery(page), probeData = await page.evaluate(() => window.__probe);
  assert(rec.recovered.sort().join() === [CH, EN].join() && rec.held.length === 0, 'both stores recovered: ' + JSON.stringify(rec));
  assert(probeData.recoveryAt != null && probeData.bootedAt != null && probeData.recoveryAt <= probeData.bootedAt, 'the recovery finished before the page reported itself started (before any feature read): ' + JSON.stringify([probeData.recoveryAt, probeData.bootedAt]));
  assert(await facade(page, CH) === chars && await facade(page, EN) === encs, 'the facade serves the recovered values, not null');
  assert(await raw(page, CH) === chars && await raw(page, EN) === encs, 'the unencrypted copy is left in place at start-up');
  await text(page, /copied into your encrypted vault/); ok('new build: unlock, recovery before the first read, values served, copy left, visible message');
  await openSecurity(page);
  assert(/Only copies that match the encrypted data are removed/.test(await page.locator('.app-dialog').innerText()), 'the dialog explains what cleanup does');
  await page.click('.app-dialog button:has-text("Remove the unencrypted copy")'); await text(page, /The unencrypted copy is removed\./);
  assert(await raw(page, CH) === null && await raw(page, EN) === null, 'verified copies are removed');
  await closeSettings(page); await page.reload(); await unlock(page);
  assert(await facade(page, CH) === chars && await facade(page, EN) === encs, 'after cleanup and a reload the stores come from the encrypted vault');
  ok('cleanup removed only verified copies and the stored vault still serves them after a reload');
  // a raw value that differs from the encrypted one: both kept, nothing chosen
  await page.evaluate(() => localStorage.setItem('plc.characters.v1', 'RAW-OTHER-VALUE')); await page.reload(); await unlock(page);
  rec = await recovery(page); assert(rec.conflicts.some((c) => c.key === CH), 'the conflict is reported: ' + JSON.stringify(rec.conflicts));
  assert(await facade(page, CH) === chars && await raw(page, CH) === 'RAW-OTHER-VALUE', 'the encrypted value is served and the raw one is kept');
  await text(page, /differ from the encrypted copy/);
  await openSecurity(page); await page.click('.app-dialog button:has-text("Remove the unencrypted copy")'); await text(page, /kept because/);
  assert(await raw(page, CH) === 'RAW-OTHER-VALUE' && await facade(page, CH) === chars, 'cleanup did not remove or change either value, and did not claim success');
  await openSecurity(page); await page.click('.app-dialog button:has-text("Remove copies that differ")'); await page.click('.app-dialog button:has-text("Remove them")');
  await page.waitForFunction(() => localStorage.getItem('plc.characters.v1') === null, null, { timeout: 20000 });
  assert(await facade(page, CH) === chars, 'the confirmed discard removes the raw copy and keeps the encrypted value');
  ok('conflict: both kept, no false success, explicit second confirmation needed to discard the differing raw copy');
  await context.close(); ctxs = []; await stop();

  // ---- phase 2: a read-only tab ----------------------------------------------------------------------------------------------------------------------------------------
  const before = await oldReaderEnables(oldDir, runs.readonly);
  stop = await serve(newDir);
  ({ context, page } = await open(runs.readonly, { init: '(' + probe + ')();' })); ctxs.push(context);
  const holder = await context.newPage(); await holder.goto(ORIGIN + '/version.json'); await holder.evaluate(() => { navigator.locks.request('plc-vault-writer', () => new Promise(() => {})); });
  await holder.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await page.goto(ORIGIN + '/'); await unlock(page);
  rec = await recovery(page);
  assert(rec.writer === false && rec.held.length === 2 && rec.held.every((h) => h.reason === 'read-only') && rec.recovered.length === 0, 'read-only tab holds, does not recover: ' + JSON.stringify(rec));
  assert(await facade(page, CH) === chars && await facade(page, EN) === encs, 'the read-only tab still reads the stores (not null)');
  assert(await logCount(page) === before, 'not one vault record was written by the read-only tab');
  await page.evaluate(`import(${VS}).then((m) => { m.appLocal.setItem('plc.characters.v1', 'OVERWRITE'); m.appLocal.removeItem('plc.encounters.v1'); })`);
  assert(await raw(page, CH) === chars && await facade(page, CH) === chars, 'writes and removals are refused for a held store');
  await text(page, /only stored unencrypted/);
  await openSecurity(page); await page.click('.app-dialog button:has-text("Remove the unencrypted copy")'); await text(page, /Nothing was removed/);
  assert(await raw(page, CH) === chars && await raw(page, EN) === encs && await logCount(page) === before, 'cleanup in a read-only tab refuses and writes nothing');
  ok('read-only tab: deferred visibly, values served, no migration or cleanup writes');
  await holder.close(); await page.close(); const page2 = await context.newPage(); await page2.goto(ORIGIN + '/'); await unlock(page2);
  rec = await recovery(page2); assert(rec.writer === true && rec.recovered.length === 2, 'once the other tab is gone the next start recovers: ' + JSON.stringify(rec));
  assert(await facade(page2, CH) === chars, 'recovered'); ok('after the lock is freed the next start recovers once');
  await context.close(); ctxs = []; await stop();

  // ---- phase 3: an interrupted write, a closed tab, a retry -----------------------------------------------------------------------------------------------------------
  await oldReaderEnables(oldDir, runs.interrupted);
  stop = await serve(newDir);
  ({ context, page } = await open(runs.interrupted, { init: '(' + probe + ')();(' + failFirstAppend + ')();' })); ctxs.push(context);
  await page.goto(ORIGIN + '/'); await unlock(page);
  rec = await recovery(page);
  assert(rec.failed.length === 1 && rec.held.length === 1 && rec.recovered.length === 1, 'one write failed, one succeeded: ' + JSON.stringify(rec));
  const heldKey = rec.held[0].key;
  assert(await facade(page, heldKey) === (heldKey === CH ? chars : encs), 'the held store is read as it is');
  await text(page, /only stored unencrypted/); await page.close({ runBeforeUnload: false });
  const again = await context.newPage(); await again.goto(ORIGIN + '/'); await unlock(again);
  rec = await recovery(again); assert(rec.held.length === 0 && rec.recovered.length === 1 && rec.recovered[0] === heldKey, 'the next start recovers the interrupted one only: ' + JSON.stringify(rec));
  assert(await facade(again, CH) === chars && await facade(again, EN) === encs && await raw(again, CH) === chars && await raw(again, EN) === encs, 'both served, both raw copies still there');
  ok('interruption: held and readable, tab closed abruptly, next start completes without duplicating the other record');
  await context.close(); ctxs = [];

  assert(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  console.log('vault-transition e2e: ok');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { for (const c of ctxs) await c.close().catch(() => {}); if (stop) await stop().catch(() => {}); }
