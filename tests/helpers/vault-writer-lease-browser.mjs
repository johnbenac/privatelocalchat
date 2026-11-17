// ACTUAL browser proof of the vault writer lease (real Chromium Web Locks + IndexedDB; the app's REAL chat/vault modules served unmodified; synthetic data only).
// Scope: the module API (createVaultControl / app / claimWriter) in real pages of one persistent browser context, NOT the visible UI (tests/e2e/character-lifecycle.e2e.mjs is the
// visible-UI proof of the same defect). Run: node tests/helpers/vault-writer-lease-browser.mjs   (last line is a JSON summary; exit 1 on any failed case)
// The page "held" lists come from navigator.locks.query(): the PHYSICAL locks, not the app's own opinion.
// PLC_LEASE_VAULT_DIR runs the SAME proof on another copy of chat/vault (the negative controls: a variant without release, or with a foreign release).
// PLC_LEASE_PROFILE_ROOT names the profile folder, PLC_LEASE_EVIDENCE a file the JSON results are written to.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const PROFILE_ROOT = process.env.PLC_LEASE_PROFILE_ROOT || (fs.existsSync('/media/Vivarium/plc-vault-writer-lease-20261117-e') ? '/media/Vivarium/plc-vault-writer-lease-20261117-e' : path.join(os.tmpdir(), 'plc-vault-writer-lease'));
fs.mkdirSync(PROFILE_ROOT, { recursive: true });
const VAULT_DIR = process.env.PLC_LEASE_VAULT_DIR || path.join(ROOT, 'chat', 'vault');
const ONLY = process.env.PLC_LEASE_ONLY ? process.env.PLC_LEASE_ONLY.split(',') : null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>vault lease</title>'); return; }
  if (!url.pathname.startsWith('/chat/vault/') || !url.pathname.endsWith('.mjs') || url.pathname.includes('..')) { res.statusCode = 404; res.end(); return; }
  try { res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(path.join(VAULT_DIR, url.pathname.slice('/chat/vault/'.length)))); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;

// Runs in every page: the page's own app / control and the physical view.
const SETUP = `
const store = await import('/chat/vault/vault-store.mjs'); const ctl = await import('/chat/vault/vault-control.mjs'); const vaultMod = await import('/chat/vault/vault.mjs'); const dbMod = await import('/chat/vault/vault-db.mjs');
const { app, appLocal } = store;
const fail = { put: false };
const docs = { all: async () => [{ id: 'd1', title: 'Synthetic document' }], put: async () => { if (fail.put) throw new Error('docs write failed (injected)'); } };
const control = ctl.createVaultControl({ app, docs, dropDocsDb: async () => {}, iterations: 1000 });
const writerLocks = async () => (await navigator.locks.query()).held.filter((x) => x.name === 'plc-vault-writer').length;
const view = async () => ({ active: app.active, readOnly: app.readOnly, exclusive: app.exclusive, rawThreads: localStorage.getItem('chatThreads') !== null, writerLocks: await writerLocks() });
const code = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, code: e && e.code, message: String(e && e.message) }));
const seed = () => appLocal.setItem('chatThreads', JSON.stringify([{ id: 't', title: 'Synthetic', messages: [] }]));
const headerExists = async () => Boolean(await dbMod.createIndexedDbAdapter().readHeader());
window.__t = { store, app, control, fail, view, code, seed, headerExists, dbMod, vaultMod };
`;
const runIn = (page, body) => page.evaluate(`(async () => { const { store, app, control, fail, view, code, seed, headerExists, dbMod, vaultMod } = window.__t; ${body} })()`);
const openPage = async (context) => { const page = await context.newPage(); await page.goto(origin + '/'); await page.evaluate(`(async () => { ${SETUP} })()`); return page; };
const globalLocks = (page) => page.evaluate(async () => (await navigator.locks.query()).held.map((x) => x.name));
const sleepP = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 4000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await sleepP(50); } };

const results = [];
const check = async (name, fn) => {
  if (ONLY && !ONLY.some((prefix) => name.startsWith(prefix))) return; // PLC_LEASE_ONLY: comma-separated case-name prefixes (the negative controls run one case)
  const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, 'lease-profile-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'block' });
  try { await fn(context); results.push({ name, pass: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, pass: false, error: String(error.message).split('\n').slice(0, 8).join(' | ') }); console.log('FAIL', name, '::', String(error.message).split('\n').slice(0, 8).join(' | ')); }
  finally { await context.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true }); }
};

// 1. the actual single-page sequence of the regression (first enable, successful off, second enable on ONE page)
await check('single page on/off/on: the second enable is exclusive and its cleanup works', async (context) => {
  const a = await openPage(context);
  const r = await runIn(a, `
    seed(); const rows = [];
    await control.enable('scratch'); await control.removePlaintext(); rows.push({ at: 'first-enable-cleanup', ...await view() });
    await control.disable('scratch'); rows.push({ at: 'off', ...await view() });
    await control.enable('scratch'); const cleanup = await code(control.removePlaintext()); rows.push({ at: 'second-enable-cleanup', cleanup, ...await view() });
    return rows;`);
  console.log(JSON.stringify(r));
  assert.deepEqual([r[0].active, r[0].exclusive, r[0].rawThreads, r[0].writerLocks], [true, true, false, 1], 'positive setup: the first enable is a REAL exclusive writer');
  assert.deepEqual([r[1].active, r[1].exclusive, r[1].rawThreads, r[1].writerLocks], [false, false, true, 0], 'after a successful off no physical writer lock is held and the plain copy is back');
  assert.equal(r[2].cleanup.ok, true, 'second enable: the cleanup is allowed: ' + JSON.stringify(r[2].cleanup));
  assert.deepEqual([r[2].active, r[2].readOnly, r[2].exclusive, r[2].rawThreads, r[2].writerLocks], [true, false, true, false, 1]);
});

// 2. the required two-page proof
await check('two pages: A on -> off, then B gets a REAL exclusive enable while A stays open', async (context) => {
  const a = await openPage(context);
  await runIn(a, `seed(); await control.enable('scratch'); await control.removePlaintext(); window.__leaseA = app.lease || null; return 1;`);
  const before = await runIn(a, `return view()`); assert.deepEqual([before.exclusive, before.writerLocks], [true, 1], 'positive setup: A is the exclusive owner');
  await runIn(a, `await control.disable('scratch'); return 1;`);
  const b = await openPage(context);
  const rb = await runIn(b, `seed(); const e = await code(control.enable('scratch')); const v = await view(); const c = e.ok ? await code(control.removePlaintext()) : null; return { e, v, c, after: await view() };`);
  console.log(JSON.stringify(rb));
  assert.equal(a.isClosed(), false, 'A stays open');
  assert.equal(rb.e.ok, true, 'B can enable while A is open: ' + JSON.stringify(rb.e));
  assert.deepEqual([rb.v.readOnly, rb.v.exclusive, rb.v.writerLocks], [false, true, 1], 'B holds the one physical writer lock and is exclusive: ' + JSON.stringify(rb.v));
  assert.equal(rb.c && rb.c.ok, true, 'B cleanup works: ' + JSON.stringify(rb.c));
  // the old A handle and A's stale state cannot release or disturb B
  const stale = await runIn(a, `const lease = window.__leaseA; const released = lease ? await lease.release() : 'no-handle'; return { released, a: await view() };`);
  assert.notEqual(stale.released, true, 'an old release releases nothing');
  assert.deepEqual([stale.a.active, stale.a.exclusive], [false, false]);
  const still = await runIn(b, `return view()`); assert.deepEqual([still.exclusive, still.writerLocks], [true, 1], 'B is still the owner after the stale release');
});

// 3. repeated cycles
await check('repeated on/off cycles on one page: always a real exclusive owner, never a held lock after off', async (context) => {
  const a = await openPage(context);
  const rows = await runIn(a, `seed(); const out = []; for (let i = 0; i < 4; i++) { await control.enable('scratch'); const on = await view(); const c = await code(control.removePlaintext()); await control.disable('scratch'); out.push({ i, on, c, off: await view() }); } return out;`);
  for (const row of rows) { assert.deepEqual([row.on.exclusive, row.on.writerLocks, row.c.ok], [true, 1, true], 'cycle ' + row.i + ' on: ' + JSON.stringify(row)); assert.deepEqual([row.off.active, row.off.exclusive, row.off.writerLocks, row.off.rawThreads], [false, false, 0, true], 'cycle ' + row.i + ' off: ' + JSON.stringify(row.off)); }
});

// 4. a read-only tab never releases or disturbs the owner
await check('a read-only page cannot enable over, disable, or release the owner (nothing written)', async (context) => {
  const a = await openPage(context);
  await runIn(a, `seed(); await control.enable('scratch'); await control.removePlaintext(); return 1;`);
  const b = await openPage(context);
  const rb = await runIn(b, `seed(); const rawBefore = localStorage.getItem('chatThreads'); const claim = await store.claimWriter(); const e = await code(control.enable('scratch'));
    const sess = await vaultMod.createVault({ adapter: dbMod.createIndexedDbAdapter() }).unlock('scratch'); app.attach(sess, { writer: false, exclusive: false, lease: claim });
    const d = await code(control.disable('scratch')); const rel = await claim.release(); return { claimWriter: claim.writer, e, d, rel, v: await view(), rawSame: localStorage.getItem('chatThreads') === rawBefore };`);
  console.log(JSON.stringify(rb));
  assert.equal(rb.claimWriter, false, 'B was refused the writer lock');
  assert.equal(rb.e.ok, false, 'B enable is refused'); assert.equal(rb.e.code, 'read-only');
  assert.equal(rb.d.ok, false); assert.equal(rb.d.code, 'read-only');
  assert.notEqual(rb.rel, true, 'a refused claim has no releasing power');
  const ra = await runIn(a, `return { v: await view(), header: await headerExists() }`);
  assert.deepEqual([ra.v.exclusive, ra.v.writerLocks, ra.header], [true, 1, true], 'A is still the exclusive owner and its vault is intact: ' + JSON.stringify(ra));
});

// 5. failed / canceled disable keeps the rightful lease and the truth
await check('a failed or canceled disable keeps the owner lease; a post-detach failure re-attaches the vault', async (context) => {
  const a = await openPage(context);
  const r = await runIn(a, `seed(); await control.enable('scratch'); await control.removePlaintext();
    const wrong = await code(control.disable('not the passphrase')); const afterWrong = await view();
    fail.put = true; const failed = await code(control.disable('scratch')); fail.put = false; const afterFailed = await view(); const header = await headerExists();
    const retry = await code(control.disable('scratch')); const afterRetry = await view();
    return { wrong, afterWrong, failed, afterFailed, header, retry, afterRetry };`);
  console.log(JSON.stringify(r));
  assert.equal(r.wrong.ok, false); assert.deepEqual([r.afterWrong.active, r.afterWrong.exclusive, r.afterWrong.writerLocks], [true, true, 1], 'wrong passphrase (a canceled/no operation) keeps everything');
  assert.equal(r.failed.ok, false, 'the injected post-detach failure is reported');
  assert.equal(r.header, true, 'the persisted vault is still there');
  assert.deepEqual([r.afterFailed.active, r.afterFailed.exclusive, r.afterFailed.writerLocks], [true, true, 1], 'the app is not left plain over a persisted vault: ' + JSON.stringify(r.afterFailed));
  assert.equal(r.retry.ok, true, 'a retry after the failure turns it off: ' + JSON.stringify(r.retry));
  assert.deepEqual([r.afterRetry.active, r.afterRetry.writerLocks], [false, 0]);
});

// 6. owner closes
await check('the owner page closes: another page can enable with a real exclusive claim; no invisible waiter blocks it', async (context) => {
  const a = await openPage(context);
  await runIn(a, `seed(); await control.enable('scratch'); return 1;`);
  const b = await openPage(context);
  const refused = await runIn(b, `seed(); const e = await code(control.enable('scratch')); window.__waiting = store.claimWriter().then((c) => { window.__claim = c; return c.waitUntilFree().then(() => { window.__freed = true; }); }); return { e, v: await view() };`);
  assert.equal(refused.e.ok, false); assert.equal(refused.e.code, 'read-only');
  await a.close();
  assert.equal(await waitFor(() => b.evaluate(() => window.__freed === true)), true, 'the waiter is told the owner is gone');
  const names = await globalLocks(b);
  assert.deepEqual(names.filter((n) => n === 'plc-vault-writer'), [], 'the waiter keeps NO writer lock after it was told: ' + JSON.stringify(names));
  const c = await openPage(context);
  // the owner's vault still exists (closing a page does not turn encryption off), so the later page does not "enable"; it claims the free writer lock for real and can unlock-and-attach as the exclusive writer
  const rc = await runIn(c, `const claim = await store.claimWriter(); const sess = claim.writer ? await vaultMod.createVault({ adapter: dbMod.createIndexedDbAdapter() }).unlock('scratch') : null; if (sess) app.attach(sess, { writer: true, exclusive: true, lease: claim }); const v = await view(); const owned = claim.owned; const off = sess ? await code(control.disable('scratch')) : null; return { writer: claim.writer, owned, supported: claim.supported, v, off, after: await view() };`);
  assert.deepEqual([rc.writer, rc.owned, rc.supported, rc.v.exclusive, rc.v.writerLocks], [true, true, true, true, 1], 'a later page gets the REAL lock: ' + JSON.stringify(rc));
  assert.equal(rc.off.ok, true); assert.equal(rc.after.writerLocks, 0, 'and it can turn the vault off and free the lock');
});

// 7. waiter notified by a successful off
await check('a waiting page is told after the owner turns the vault off; the temporary request is gone and does not promote it', async (context) => {
  const a = await openPage(context);
  await runIn(a, `seed(); await control.enable('scratch'); return 1;`);
  const b = await openPage(context);
  await runIn(b, `window.__claim = await store.claimWriter(); window.__freed = false; window.__claim.waitUntilFree().then(() => { window.__freed = true; }); return 1;`);
  assert.equal(await b.evaluate(() => window.__claim.writer), false);
  await runIn(a, `await control.disable('scratch'); return 1;`);
  assert.equal(await waitFor(() => b.evaluate(() => window.__freed === true)), true, 'the waiter hears about a successful off');
  const names = await globalLocks(b);
  assert.deepEqual(names.filter((n) => n === 'plc-vault-writer'), [], 'no waiter lock is kept: ' + JSON.stringify(names));
  const stillRefused = await b.evaluate(() => ({ writer: window.__claim.writer, owned: window.__claim.owned === true }));
  assert.deepEqual(stillRefused, { writer: false, owned: false }, 'the old refused claim was never promoted to a writer');
  const a2 = await runIn(a, `const e = await code(control.enable('scratch')); return { e, v: await view() };`);
  assert.equal(a2.e.ok, true); assert.deepEqual([a2.v.exclusive, a2.v.writerLocks], [true, 1]);
});

// 8. stale handle of the SAME page
await check('a stale lease of the same page (older cycle) cannot release the newer lease', async (context) => {
  const a = await openPage(context);
  const r = await runIn(a, `seed(); await control.enable('scratch'); const old = app.lease; await control.disable('scratch'); await control.enable('scratch');
    const fresh = app.lease; const before = await view(); const released = old ? await old.release() : 'no-handle'; const after = await view(); return { same: old === fresh, released, before, after, ownedStill: fresh ? fresh.owned : null };`);
  console.log(JSON.stringify(r));
  assert.equal(r.same, false, 'the second enable has its own handle');
  assert.deepEqual([r.before.exclusive, r.before.writerLocks], [true, 1], 'positive setup: the second enable is a real exclusive owner');
  assert.equal(r.released, false, 'the old handle releases nothing');
  assert.deepEqual([r.after.exclusive, r.after.writerLocks, r.ownedStill], [true, 1, true], 'the newer lease is untouched: ' + JSON.stringify(r.after));
});

await new Promise((r) => server.close(r));
const failed = results.filter((r) => !r.pass).map((r) => r.name);
const summary = { total: results.length, passed: results.length - failed.length, failed };
if (process.env.PLC_LEASE_EVIDENCE) fs.writeFileSync(process.env.PLC_LEASE_EVIDENCE, JSON.stringify({ scope: 'actual module API + real Chromium Web Locks/IndexedDB, not the visible UI', vaultDir: VAULT_DIR, results, summary }, null, 2));
console.log(JSON.stringify(summary));
process.exit(failed.length ? 1 : 0);
