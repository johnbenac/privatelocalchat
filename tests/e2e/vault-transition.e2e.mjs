// ACTUAL integrated new build -> OLD release (git 0b0ef275) -> integrated new build, in a real browser on ONE origin and ONE profile per case (docs/DATA-COMPATIBILITY.md).
//   node scripts/e2e.mjs vault-transition
// NEW = `git archive` of the clean committed HEAD of this checkout, NO source transform (the real plc.characters.v1 class and the real writer). OLD = `git archive` of the earlier release.
// Both are built by tests/e2e/vault-transition-support.mjs with the real commit id and real commit time (GITHUB_SHA, SOURCE_DATE_EPOCH); no git repository, author or commit is invented.
// Characters are the producer's genuine packages (tests/fixtures/characters: Pip, Neri with a picture and a text file) admitted through the VISIBLE import UI.
// Fixture prep (labelled FIXTURE-PREP): seeding a plaintext chat/prefs so the old release has something it knows to remove, and a differing raw value for the conflict case.
// Every claimed person action (import, enabling the vault in the old release, unlock, cleanup, discard) uses visible controls. Reads of storage/facade are observations.
// plc.encounters.v1 (T418) is NOT exercised here: its production writer is not merged. Synthetic JSON is never presented as producer admission.
// Neri's stored source.bytes ARRAY is checked byte for byte against the fixture files by assertNeriResources (the same helper tests/vault-transition-harness.test.mjs exercises).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertCleanCheckout, buildArchive, allocateScratchChild, cleanupOwnedChild, assertNeriResources } from './vault-transition-support.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { newProfileDir } from './profile-root.mjs';
import { assert } from './harness.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const OLD_REV = '0b0ef27530a25e9d218ecae5460066162b07a6da', CH = 'plc.characters.v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 18491 + Number(process.env.E2E_PORT_OFFSET || 0), ORIGIN = `http://127.0.0.1:${PORT}`;
// Each process owns one child of the supplied parent (default: the ignored work/ folder of this checkout, never /tmp) and removes only that child.
const owned = allocateScratchChild(process.env.PLC_TRANSITION_SCRATCH || path.join(ROOT, 'work', 'transition-scratch'), 'e2e');
const scratch = owned.dir;
const evidencePath = process.env.PLC_TRANSITION_EVIDENCE || path.join(scratch, 'evidence.json');
const evidence = { cases: {}, sources: {} };
const ok = (n) => console.log('PASS ' + n);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const fx = new URL('../fixtures/characters/', import.meta.url);
const bundle = (n) => fs.readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8');
const PASS = 'correct horse';
const thread = [{ id: 't0', title: 'Synthetic chat', messages: [{ role: 'user', content: 'SYNTH-CHAT-MARK' }] }];

function prepare() {
  assertCleanCheckout(ROOT);
  const nodeModules = path.join(ROOT, 'node_modules');
  const old = buildArchive({ repo: ROOT, rev: OLD_REV, workDir: scratch, name: 'old', nodeModules });
  const cur = buildArchive({ repo: ROOT, rev: 'HEAD', workDir: scratch, name: 'new', nodeModules });
  assert(old.sha === OLD_REV && cur.sha !== OLD_REV, 'OLD is the exact release and NEW is a different commit');
  const fileSha = (d, f) => fs.existsSync(path.join(d, f)) ? sha(fs.readFileSync(path.join(d, f))) : null;
  for (const f of ['chat/vault/key-classes.mjs', 'chat/vault/vault-store.mjs', 'chat/vault/vault-control.mjs', 'chat/characters/characters-ui.mjs', 'chat/characters/character-store.mjs']) {
    const o = fileSha(old.dir, f), n = fileSha(cur.dir, f), w = fileSha(ROOT, f);
    evidence.sources[f] = { old: o, new: n, workingTree: w }; console.log(`SOURCE ${f} old=${o} new=${n} newEqualsCleanCheckout=${n === w}`);
    assert(n === w, 'NEW build source equals the clean checkout: ' + f);
  }
  const keep = ({ name, sha: commit, epoch, archiveSha256, version, versionJsonSha256 }) => ({ name, commit, epoch, archiveSha256, version, versionJsonSha256 });
  evidence.oldCommit = old.sha; evidence.newCommit = cur.sha; evidence.builds = { old: keep(old), new: keep(cur) };
  return { oldDir: old.dir, newDir: cur.dir };
}
async function serve(dir) {
  const web = spawn('node', ['scripts/serve.mjs'], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(ORIGIN + '/')).ok) break; } catch { /* starting */ } await sleep(100); }
  let stopped = false; // idempotent: the final cleanup may call a stop that already ran
  return async () => { if (stopped) return; stopped = true; web.kill(); await new Promise((r) => web.once('exit', r)); await sleep(200); };
}

const errors = [];
async function open(profile, { init = null } = {}) {
  const context = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebGPU|webgpu|simulated interruption/i.test(m.text())) errors.push(m.text()); });
  if (init) await page.addInitScript(typeof init === 'string' ? { content: init } : init);
  return { context, page };
}
const probe = () => { window.__probe = {}; window.addEventListener('plc:vault-recovery', (e) => { window.__probe.recoveryAt = performance.now(); window.__probe.detail = e.detail; }); let b; Object.defineProperty(window, '__plcBooted', { configurable: true, get: () => b, set: (v) => { b = v; if (v === true && window.__probe.bootedAt == null) window.__probe.bootedAt = performance.now(); } }); };
const noLocks = () => { try { Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }); } catch { /* ignore */ } };
const ready = async (page) => { await page.waitForSelector('#messageInput'); await page.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 30000 }); await page.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const unlock = async (page) => { await page.waitForSelector('#lockScreen', { state: 'visible', timeout: 30000 }); await page.fill('#unlockPass', PASS); await page.press('#unlockPass', 'Enter'); await page.waitForSelector('#lockScreen', { state: 'hidden', timeout: 30000 }); await ready(page); };
const openSecurity = async (page) => { if (!await page.locator('#settingsPage').isVisible()) { await page.click('button[aria-label="This device menu"]'); await page.click('.shell-pop-row:has-text("Settings")'); } await page.click('.settings-nav-item[data-section="security"]'); await page.click('.set-row:has-text("App lock") button'); };
const closeSettings = async (page) => { if (await page.locator('#settingsPage').isVisible()) await page.click('button[aria-label="Close settings"]'); };
const text = (page, re) => page.waitForFunction((s) => new RegExp(s).test(document.body.innerText), re.source, { timeout: 20000 });
const raw = (page, k = CH) => page.evaluate((k) => localStorage.getItem(k), k);
const VS = "'/releases/'+window.APP_BUILD.commit+'/chat/vault/vault-store.mjs'";
const facade = (page, k = CH) => page.evaluate(`import(${VS}).then((m) => m.appLocal.getItem(${JSON.stringify(k)}))`);
const recovery = (page) => page.evaluate(`import(${VS}).then((m) => { const r = m.app.recovery; return r ? JSON.parse(JSON.stringify(r)) : null; })`);
const buildInfo = (page) => page.evaluate(async () => { const base = '/releases/' + window.APP_BUILD.commit + '/'; const h = async (f) => { const b = await (await fetch(base + f)).arrayBuffer(); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map((x) => x.toString(16).padStart(2, '0')).join(''); }; return { commit: window.APP_BUILD.commit, vaultStore: await h('chat/vault/vault-store.mjs'), keyClasses: await h('chat/vault/key-classes.mjs'), sw: (await navigator.serviceWorker?.getRegistrations?.() || []).length }; });
const logCount = (page) => page.evaluate(async () => { const db = await new Promise((res, rej) => { const r = indexedDB.open('plc-vault'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); const n = await new Promise((res, rej) => { const q = db.transaction('log').objectStore('log').count(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); db.close(); return n; });
const plain = async (page) => page.evaluate(async () => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out.push(k + '=' + localStorage.getItem(k)); } return out.join('\n'); });

// ---- NEW build: visible import of the genuine producer packages ------------------------------------------------------------------------------------------------------
const openInstructions = async (p) => { if (!await p.locator('#systemPromptInput').isVisible()) { await p.click('#shellPlus'); await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")'); } await p.waitForSelector('#importCharacterBtn', { state: 'visible' }); };
const admit = async (p, name, content) => {
  await openInstructions(p);
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#importCharacterBtn')]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
  await p.locator('.app-dialog:has-text("Review character")').waitFor();
  await p.click('.app-dialog .dialog-actions .primary'); await p.waitForFunction(() => !document.querySelector('.app-dialog'));
};
/** FIXTURE-PREP + visible product action: NEW build admits Pip and Neri through the UI on a fresh profile. Returns the exact raw JSON written by the actual writer. */
async function newAdmits(newDir, profile, label) {
  const stop = await serve(newDir); const { context, page } = await open(profile);
  await page.goto(ORIGIN + '/'); await page.waitForSelector('#messageInput');
  await page.evaluate(() => { localStorage.setItem('plc.lockSplash.v1', 'off'); localStorage.setItem('plc.inferenceMode.v1', 'api'); }); // FIXTURE-PREP
  await page.reload(); await ready(page);
  await page.click('#newChatBtn');
  await admit(page, 'pip.bundle.json', bundle('minimal')); await admit(page, 'neri.bundle.json', bundle('neri'));
  const rawJson = await raw(page); const parsed = JSON.parse(rawJson);
  assert(parsed.records.length === 2 && parsed.records.some((r) => r.preview.name === 'Pip') && parsed.records.some((r) => r.preview.name === 'Neri'), label + ': actual writer stored Pip and Neri: ' + parsed.records.map((r) => r.preview.name));
  const neri = parsed.records.find((r) => r.preview.name === 'Neri');
  await assertNeriResources(neri); // exact source.bytes ARRAY entries for tide-card.txt and chart.png by SHA-256, plus root/envelope/structure equal to the real producer
  evidence.cases[label] = { rawSha256: sha(rawJson), rawBytes: rawJson.length, ids: parsed.records.map((r) => r.individualId), build: await buildInfo(page) };
  // FIXTURE-PREP: plaintext things the OLD release knows, so its visible enable flow offers cleanup
  await page.evaluate((th) => { localStorage.setItem('chatThreads', JSON.stringify(th)); localStorage.setItem('plc.prefs.v1', '{"enterSends":true}'); }, thread);
  await context.close(); await stop();
  return rawJson;
}
/** OLD release (exact 0b0ef275): visible enable of the vault, visible removal of the plaintext it knows. Unknown character raw must remain. */
async function oldEnables(oldDir, profile, rawJson, label) {
  const stop = await serve(oldDir); const { context, page } = await open(profile);
  await page.goto(ORIGIN + '/'); await ready(page);
  const info = await buildInfo(page); evidence.cases[label].oldBuild = info;
  await openSecurity(page); await page.check('#lockEncrypt'); await page.fill('#lockNew1', PASS); await page.fill('#lockNew2', PASS); await page.click('.app-dialog button:has-text("Lock the app")');
  await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")', { timeout: 60000 }); await page.click('.app-dialog button:has-text("Remove it")');
  await page.waitForFunction(() => !localStorage.getItem('chatThreads'), null, { timeout: 30000 });
  assert(await raw(page) === rawJson, label + ': OLD release leaves the unknown character store byte-for-byte');
  assert(await raw(page, 'plc.vault.v1') && !(await raw(page, 'chatThreads')) && !(await raw(page, 'plc.prefs.v1')), label + ': old release enabled the vault and removed the plaintext it knows');
  const n = await logCount(page); await context.close(); await stop();
  return { info, n };
}
const startNew = async (newDir, profile, init) => { const stop = await serve(newDir); const r = await open(profile, { init }); return { ...r, stop }; };
let ctxs = [], stop = null;
try {
  const { oldDir, newDir } = prepare();
  const profile = (n) => newProfileDir('vault-broad-' + n);

  // ===== A. primary: new admits -> old enables -> new unlocks, recovers before first read, cleanup, reload =====
  const A = profile('a');
  const rawA = await newAdmits(newDir, A, 'A'); const oldA = await oldEnables(oldDir, A, rawA, 'A');
  let s = await startNew(newDir, A, '(' + probe + ')();'); let { context, page } = s; stop = s.stop; ctxs.push(context);
  await page.goto(ORIGIN + '/'); await page.waitForSelector('#lockScreen', { state: 'visible', timeout: 30000 });
  assert(await raw(page) === rawA, 'A: before unlock the raw character store is untouched');
  const newInfo = await buildInfo(page); evidence.cases.A.newBuildAfterOld = newInfo;
  assert(newInfo.commit !== oldA.info.commit && newInfo.vaultStore !== oldA.info.vaultStore, 'A: OLD and NEW release and vault-store module identities differ: ' + JSON.stringify([oldA.info, newInfo]));
  assert(newInfo.sw === 0 && oldA.info.sw === 0, 'A: no service worker registered');
  await page.fill('#unlockPass', PASS); await page.press('#unlockPass', 'Enter'); await page.waitForSelector('#lockScreen', { state: 'hidden', timeout: 30000 }); await ready(page);
  let rec = await recovery(page); const pr = await page.evaluate(() => window.__probe);
  assert(rec.recovered.includes(CH) && rec.held.length === 0 && rec.conflicts.length === 0, 'A: character store recovered, nothing held: ' + JSON.stringify(rec));
  assert(pr.recoveryAt != null && pr.bootedAt != null && pr.recoveryAt <= pr.bootedAt, 'A: recovery finished before the page reported started (before feature reads)');
  assert(await facade(page) === rawA, 'A: the facade serves the exact recovered source/resources/identity, not null');
  assert(await raw(page) === rawA, 'A: raw copy left until the person chooses cleanup');
  await text(page, /copied into your encrypted vault/);
  // visible library shows both people
  await page.click('#newChatBtn'); await openInstructions(page); await page.click('#savedCharactersBtn'); await page.waitForSelector('.app-dialog:has-text("Saved characters")');
  const lib = await page.locator('.app-dialog').innerText(); assert(/Pip/.test(lib) && /Neri/.test(lib), 'A: library shows Pip and Neri after recovery');
  await page.click('.app-dialog .dialog-actions .primary'); await page.waitForFunction(() => !document.querySelector('.app-dialog'));
  await openSecurity(page); await page.click('.app-dialog button:has-text("Remove the unencrypted copy")'); await text(page, /The unencrypted copy is removed\./);
  assert(await raw(page) === null, 'A: verified raw copy removed by the visible choice');
  await closeSettings(page); await page.reload(); await unlock(page);
  assert(await facade(page) === rawA, 'A: after cleanup + reload the encrypted copy is exact');
  const all = await plain(page); assert(!/Neri|Pip|individual:/.test(all), 'A: nothing readable of the characters remains in localStorage');
  ok('A: new admits genuine Pip+Neri; old release enables vault; new unlock recovers exact bytes before reads; cleanup+reload exact; nothing readable left');
  await context.close(); ctxs = []; await stop();

  // ===== B. changed raw vs encrypted: both kept, default cleanup refuses, explicit discard names loss =====
  const B = profile('b'); const rawB = await newAdmits(newDir, B, 'B'); await oldEnables(oldDir, B, rawB, 'B');
  s = await startNew(newDir, B); ({ context, page } = s); stop = s.stop; ctxs.push(context);
  await page.goto(ORIGIN + '/'); await unlock(page);
  assert(await facade(page) === rawB, 'B: recovered'); // left raw equal
  await page.evaluate((k) => localStorage.setItem(k, 'RAW-OTHER-VALUE'), CH); // FIXTURE-PREP: an unexplained differing raw copy
  await page.reload(); await unlock(page);
  rec = await recovery(page); assert(rec.conflicts.some((c) => c.key === CH), 'B: conflict reported: ' + JSON.stringify(rec.conflicts));
  assert(await facade(page) === rawB && await raw(page) === 'RAW-OTHER-VALUE', 'B: encrypted served, raw kept');
  await text(page, /differ from the encrypted copy/);
  await openSecurity(page); await page.click('.app-dialog button:has-text("Remove the unencrypted copy")'); await text(page, /kept because/);
  assert(await raw(page) === 'RAW-OTHER-VALUE' && await facade(page) === rawB, 'B: default cleanup removed nothing and claimed no success');
  await openSecurity(page); await page.click('.app-dialog button:has-text("Permanently delete differing items")');
  const warn = await page.locator('.app-dialog').last().innerText(); evidence.cases.B.discardWording = warn.replace(/\s+/g, ' ').slice(0, 500);
  assert(/permanent/i.test(warn) && /cannot be undone/i.test(warn) && /gone for good/i.test(warn), 'B: discard wording names permanent loss: ' + warn);
  // cancel first: nothing changes
  await page.locator('.app-dialog button:has-text("Cancel")').last().click(); await sleep(300);
  assert(await raw(page) === 'RAW-OTHER-VALUE', 'B: cancelling the discard changes nothing');
  await page.click('.app-dialog button:has-text("Permanently delete differing items")'); await page.click('.app-dialog button:has-text("Delete them permanently")');
  await page.waitForFunction((k) => localStorage.getItem(k) === null, CH, { timeout: 20000 });
  assert(await facade(page) === rawB, 'B: explicit discard removes only the raw copy');
  ok('B: conflict keeps both, default cleanup refuses, explicit discard names permanent loss and is cancellable');
  await context.close(); ctxs = []; await stop();

  // ===== E. disable with a differing raw copy: refuses, preserves everything; explicit replace names the loss =====
  const E = profile('e'); const rawE = await newAdmits(newDir, E, 'E'); await oldEnables(oldDir, E, rawE, 'E');
  s = await startNew(newDir, E); ({ context, page } = s); stop = s.stop; ctxs.push(context);
  await page.goto(ORIGIN + '/'); await unlock(page);
  await page.evaluate((k) => localStorage.setItem(k, 'RAW-OTHER-VALUE'), CH); // FIXTURE-PREP: unexplained differing raw copy
  await page.reload(); await unlock(page);
  await openSecurity(page); await page.fill('#lockCurrent', PASS); await page.click('.app-dialog button:has-text("Turn encryption off")'); await page.click('.app-dialog button:has-text("Turn it off")');
  await page.waitForSelector('.app-dialog:has-text("Replace the unencrypted items that differ?")', { timeout: 20000 });
  const repl = await page.locator('.app-dialog').last().innerText(); evidence.cases.E.replaceWording = repl.replace(/\s+/g, ' ').slice(0, 500);
  assert(/gone for good/i.test(repl), 'E: replacement confirmation names permanent loss');
  await page.locator('.app-dialog button:has-text("Cancel")').last().click(); await sleep(300);
  assert(await raw(page) === 'RAW-OTHER-VALUE' && !!(await raw(page, 'plc.vault.v1')) && await facade(page) === rawE, 'E: default disable preserved raw, vault header and encrypted copy');
  await page.click('.app-dialog button:has-text("Turn encryption off")'); await page.click('.app-dialog button:has-text("Turn it off")');
  await page.click('.app-dialog button:has-text("Replace them and turn it off")');
  await page.waitForFunction(() => !localStorage.getItem('plc.vault.v1'), null, { timeout: 30000 });
  assert(await raw(page) === rawE, 'E: only after the explicit choice, the raw key holds exactly the encrypted text observed');
  ok('E: disable refuses on a differing raw copy; explicit replacement writes only the observed encrypted text');
  await context.close(); ctxs = []; await stop();

  // ===== C. read-only second tab: reads, no migration/cleanup; then recovery after the holder closes =====
  const C = profile('c'); const rawC = await newAdmits(newDir, C, 'C'); const oc = await oldEnables(oldDir, C, rawC, 'C');
  s = await startNew(newDir, C); ({ context, page } = s); stop = s.stop; ctxs.push(context);
  const holder = await context.newPage(); await holder.goto(ORIGIN + '/version.json'); await holder.evaluate(() => { navigator.locks.request('plc-vault-writer', () => new Promise(() => {})); }); await holder.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await page.goto(ORIGIN + '/'); await unlock(page);
  rec = await recovery(page); assert(rec.writer === false && rec.held.some((h) => h.key === CH && h.reason === 'read-only') && rec.recovered.length === 0, 'C: read-only tab holds: ' + JSON.stringify(rec));
  assert(await facade(page) === rawC, 'C: read-only tab still reads the exact characters (never empty)');
  assert(await logCount(page) === oc.n, 'C: no vault record written');
  await text(page, /only stored unencrypted/);
  await openSecurity(page); await page.click('.app-dialog button:has-text("Remove the unencrypted copy")'); await text(page, /Nothing was removed/);
  assert(await raw(page) === rawC && await logCount(page) === oc.n, 'C: cleanup in a read-only tab refuses and writes nothing');
  await holder.close(); await page.close(); const p2 = await context.newPage(); await p2.goto(ORIGIN + '/'); await unlock(p2);
  rec = await recovery(p2); assert(rec.writer === true && rec.recovered.includes(CH), 'C: next start recovers: ' + JSON.stringify(rec));
  assert(await facade(p2) === rawC, 'C: exact after recovery');
  ok('C: read-only tab neither migrates nor cleans, never shows empty; recovers once the holder is gone');
  await context.close(); ctxs = []; await stop();

  // ===== D. no navigator.locks at boot: held, readable, write-blocked, nothing destroyed =====
  const D = profile('d'); const rawD = await newAdmits(newDir, D, 'D'); const od = await oldEnables(oldDir, D, rawD, 'D');
  s = await startNew(newDir, D, '(' + noLocks + ')();'); ({ context, page } = s); stop = s.stop; ctxs.push(context);
  await page.goto(ORIGIN + '/'); await unlock(page);
  rec = await recovery(page); assert(rec.recovered.length === 0 && rec.held.some((h) => h.key === CH), 'D: no exclusive writer => held: ' + JSON.stringify(rec));
  { const f = await facade(page), r = await raw(page), n = await logCount(page);
    evidence.cases.D.logBeforeUnlock = od.n; evidence.cases.D.logAfterUnlock = n; // other (non-character) app records may be appended at start; the CHARACTER key must not be, proven by the recovery on the next locked start below
    assert(f === rawD && r === rawD, 'D: raw readable and served exactly ' + JSON.stringify({ facadeEq: f === rawD, facadeNull: f === null, rawEq: r === rawD, log: n, before: od.n })); }
  await openSecurity(page); await page.click('.app-dialog button:has-text("Remove the unencrypted copy")'); await text(page, /Nothing was removed|kept/);
  assert(await raw(page) === rawD && await facade(page) === rawD, 'D: cleanup without exclusive writer destroys nothing');
  await context.close(); ctxs = []; await stop();
  s = await startNew(newDir, D); ({ context, page } = s); stop = s.stop; ctxs.push(context);
  await page.goto(ORIGIN + '/'); await unlock(page);
  rec = await recovery(page); assert(rec.recovered.includes(CH) && await facade(page) === rawD, 'D: the character store was never written while no exclusive writer existed, so a normal start recovers it: ' + JSON.stringify(rec));
  ok('D: no Web Locks: held honestly, raw+encrypted preserved, cleanup refuses');
  await context.close(); ctxs = []; await stop();

  assert(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 1)); console.log('EVIDENCE ' + evidencePath);
  console.log('vault-broad-transition e2e: ok');
} catch (error) { console.error(error); try { fs.writeFileSync(evidencePath + '.failed', JSON.stringify(evidence, null, 1)); } catch { /* */ } process.exitCode = 1; }
finally { for (const c of ctxs) await c.close().catch(() => {}); if (stop) await stop().catch(() => {}); try { if (!process.env.PLC_TRANSITION_KEEP) cleanupOwnedChild(owned); } catch (e) { console.error(e.message); process.exitCode = 1; } }
