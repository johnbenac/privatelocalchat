// ONE round of the barrier-released multi-page proof of the vault writer lease (real Chromium Web Locks + IndexedDB, the app's real chat/vault modules, synthetic data, a fresh profile).
// verify-lease.py runs this 20 times (each run is a new browser); PLC_LEASE_VAULT_DIR runs it on another copy of chat/vault (the negative controls).
// 5 pages of one profile. Phase 1, released together by a shared wall-clock barrier: P0 (the owner) turns the vault off while P1 and P2 turn it on, P3 only claims the writer lock, P4 asks for a
// recovery retry. Phase 2: the owner page is CLOSED (a crash / last owner leaving) and the survivors race claimWriter twice (the winner releases between the races).
// Invariants, checked from the PHYSICAL lock table (navigator.locks.query), not from what the app says:
//   I1 no duplicate physical owner: at most one 'plc-vault-writer' lock is held at any observation (sampled every 5 ms) and every held lock is owned by exactly one page's handle (no invisible holder);
//   I2 exclusive truth: a page whose app says exclusive owns the lock; a refused/read-only/unsupported page never does;
//   I3 no lost or corrupted raw data: chatThreads is byte-identical at the end of every phase; no page error; the stored vault header exists iff some page has the vault on;
//   I4 no stale release: a released handle never ends a newer owner; releases that did not own report false;
//   I5 no deadlock: every step finishes inside its timeout;  I6 last owner closing frees the lock; a notified waiter keeps no lock; exactly one winner per claim race.
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
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('DEADLOCK/timeout: ' + what)), ms))]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>lease concurrency</title>'); return; }
  if (!url.pathname.startsWith('/chat/vault/') || !url.pathname.endsWith('.mjs') || url.pathname.includes('..')) { res.statusCode = 404; res.end(); return; }
  try { res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(path.join(VAULT_DIR, url.pathname.slice('/chat/vault/'.length)))); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, 'lease-conc-'));
const context = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'block' });
const errors = [];
const SETUP = `
const store = await import('/chat/vault/vault-store.mjs'); const ctl = await import('/chat/vault/vault-control.mjs'); const dbMod = await import('/chat/vault/vault-db.mjs');
const { app, appLocal } = store;
const control = ctl.createVaultControl({ app, docs: { all: async () => [{ id: 'd1', title: 'doc' }], put: async () => {} }, dropDocsDb: async () => {}, iterations: 1000 });
const code = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, code: e && e.code, message: String(e && e.message) }));
window.__t = { store, app, control, code, dbMod, raw: null, claim: null, freed: false };
`;
const open = async () => { const p = await context.newPage(); p.on('pageerror', (e) => errors.push(String(e))); await p.goto(origin + '/'); await p.evaluate(`(async () => { ${SETUP} })()`); return p; };
const inPage = (p, body) => p.evaluate(`(async () => { const { store, app, control, code, dbMod } = window.__t; ${body} })()`);
const barrierAt = () => Date.now() + 400;
const pages = []; for (let i = 0; i < 5; i++) pages.push(await open());
const RAW = JSON.stringify([{ id: 't', title: 'Synthetic', messages: [] }]);
const rawOf = (p) => p.evaluate(() => localStorage.getItem('chatThreads'));
const physical = async (p) => p.evaluate(async () => (await navigator.locks.query()).held.filter((x) => x.name === 'plc-vault-writer').length);
const ownersOf = async () => { const out = []; for (const [i, p] of pages.entries()) { if (p.isClosed()) continue; out.push({ i, owns: await p.evaluate(() => { const t = window.__t; return Boolean((t.app.lease && t.app.lease.owned) || (t.claim && t.claim.owned)); }), exclusive: await p.evaluate(() => window.__t.app.exclusive), active: await p.evaluate(() => window.__t.app.active) }); } return out; };
const result = { phases: {} };
try {
  await pages[0].evaluate((raw) => { localStorage.setItem('chatThreads', raw); }, RAW);
  await withTimeout(inPage(pages[0], `return await control.enable('scratch');`), 20000, 'owner enable');
  assert.equal(await physical(pages[0]), 1, 'positive setup: the owner holds one REAL writer lock');
  // sampler for I1
  let maxHeld = 0, sampling = true; const sampler = (async () => { while (sampling) { try { maxHeld = Math.max(maxHeld, await physical(pages[4])); } catch { /* page busy */ } await new Promise((r) => setTimeout(r, 5)); } })();
  // ---- phase 1: barrier
  const at = barrierAt(); const wait = `await new Promise((r) => setTimeout(r, ${at} - Date.now()));`;
  const ops = await withTimeout(Promise.all([
    inPage(pages[0], `${wait} return await code(control.disable('scratch'));`),
    inPage(pages[1], `${wait} return await code(control.enable('scratch'));`),
    inPage(pages[2], `${wait} return await code(control.enable('scratch'));`),
    inPage(pages[3], `${wait} window.__t.claim = await store.claimWriter(); return { writer: window.__t.claim.writer, owned: window.__t.claim.owned };`),
    inPage(pages[4], `${wait} return await code(control.retryRecovery());`)
  ]), 45000, 'phase 1');
  result.phases.one = { ops };
  await new Promise((r) => setTimeout(r, 300));
  const owners1 = await ownersOf(); const held1 = await physical(pages[4]);
  const owning = owners1.filter((o) => o.owns);
  assert.ok(ops[0].ok, 'the owner\'s disable succeeded: ' + JSON.stringify(ops[0]));
  assert.ok(owning.length <= 1, 'I1 at most one handle owns the lock: ' + JSON.stringify(owners1));
  assert.equal(held1, owning.length, 'I1 every physical lock has exactly one owning handle (no invisible holder): physical=' + held1 + ' ' + JSON.stringify(owners1));
  for (const o of owners1) if (o.exclusive) assert.ok(o.owns, 'I2 a page that says exclusive owns the lock: ' + JSON.stringify(o));
  const active = owners1.filter((o) => o.active); assert.ok(active.length <= 1, 'one vault, at most one page with it on: ' + JSON.stringify(owners1));
  const header = await pages[4].evaluate(async () => Boolean(await window.__t.dbMod.createIndexedDbAdapter().readHeader()));
  assert.equal(header, active.length === 1, 'I3 the stored vault exists iff one page has it on: header=' + header + ' ' + JSON.stringify(owners1));
  for (const p of pages) assert.equal(await rawOf(p), RAW, 'I3 raw chatThreads byte-identical (phase 1)');
  for (const o of ops.slice(1, 3)) assert.ok(o.ok || ['read-only', 'exists', 'busy', 'no-exclusive'].includes(o.code), 'a refusal is a truthful named refusal: ' + JSON.stringify(o));
  result.phases.one.owners = owners1; result.phases.one.physical = held1;
  // ---- phase 2: the owner leaves (crash), survivors race the claim
  const ownerPage = owning.length ? pages[owning[0].i] : null;
  if (ownerPage) { await ownerPage.close({ runBeforeUnload: false }); }
  const survivors = pages.filter((p) => !p.isClosed());
  // each survivor first drops whatever it held (its own handle only), so the race starts from a free lock
  await Promise.all(survivors.map((p) => inPage(p, `const r = []; if (app.lease && app.lease.owned) r.push(await app.lease.release()); if (window.__t.claim) r.push(await window.__t.claim.release()); window.__t.claim = null; return r;`)));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await physical(survivors[0]), 0, 'I6 last owner gone and released: nothing is held');
  const races = [];
  for (let round = 0; round < 2; round++) {
    const at2 = barrierAt(); const wait2 = `await new Promise((r) => setTimeout(r, ${at2} - Date.now()));`;
    const res = await withTimeout(Promise.all(survivors.map((p) => inPage(p, `${wait2} const c = await store.claimWriter(); window.__t.claim = c; if (!c.writer) { window.__t.freed = false; c.waitUntilFree().then(() => { window.__t.freed = true; }); } return { writer: c.writer, owned: c.owned };`))), 30000, 'claim race ' + round);
    const winners = res.filter((r) => r.writer && r.owned);
    assert.equal(winners.length, 1, 'I6 exactly one winner per claim race: ' + JSON.stringify(res)); assert.equal(await physical(survivors[0]), 1);
    const widx = res.findIndex((r) => r.writer && r.owned);
    // I4: a refused handle's release does nothing to the winner
    for (const [i, p] of survivors.entries()) if (i !== widx) assert.equal(await inPage(p, `return await window.__t.claim.release();`), false, 'I4 a refused claim has no releasing power');
    assert.equal(await physical(survivors[0]), 1, 'I4 the winner still owns after the others tried to release');
    assert.equal(await inPage(survivors[widx], `return await window.__t.claim.release();`), true); assert.equal(await inPage(survivors[widx], `return await window.__t.claim.release();`), false, 'I4 idempotent');
    // the waiters are told, and keep no lock
    for (const [i, p] of survivors.entries()) if (i !== widx) { const end = Date.now() + 5000; while (Date.now() < end && !await p.evaluate(() => window.__t.freed)) await new Promise((r) => setTimeout(r, 25)); assert.equal(await p.evaluate(() => window.__t.freed), true, 'the waiter was told'); }
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await physical(survivors[0]), 0, 'I6 after the release and the notices nothing is held (no waiter keeps a lock)');
    for (const p of survivors) await inPage(p, `window.__t.claim = null; return 1;`);
    races.push(res);
  }
  result.phases.two = { races };
  for (const p of survivors) assert.equal(await rawOf(p), RAW, 'I3 raw chatThreads byte-identical (phase 2)');
  sampling = false; await sampler; assert.ok(maxHeld <= 1, 'I1 sampled at most one physical writer lock: ' + maxHeld);
  assert.deepEqual(errors, [], 'no page errors');
  result.maxHeld = maxHeld; result.pass = true;
} catch (error) { result.pass = false; result.error = String(error.message).split('\n').slice(0, 10).join(' | '); }
finally { await context.close().catch(() => {}); await new Promise((r) => server.close(r)); fs.rmSync(profile, { recursive: true, force: true }); }
console.log(JSON.stringify(result));
process.exit(result.pass ? 0 : 1);
