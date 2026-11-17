// The durable coordination record of the paired conversation stores in REAL Chromium with REAL IndexedDB, and what the encrypted vault does with it (chat/encounters/coordination.mjs).
//   node scripts/e2e.mjs encounters-store-safety      (a dedicated profile on /media/Vivarium: PLC_E2E_PROFILE_ROOT)
// Sections (everything is read through the page like a person's storage, the provider is the harness's fake one):
//   1 plain, two tabs: each save is acknowledged; the record in IndexedDB `plc-encounters-coord` is stable and holds only 64-hex digests (the typed marker is nowhere in it)
//   2 the record store cannot be opened in one tab (a test-only wrapper around indexedDB.open for that one database): that tab REFUSES with 'coordination-unavailable', chatThreads/ledger bytes are
//     unchanged, and a tab without the fault still saves
//   3 encrypted vault (the real Settings flow of tests/e2e/vault.e2e.mjs): after turning it on no coordination record remains, nothing readable is at rest anywhere, saves work, a reload with the
//     passphrase shows the chat, and a second tab is READ-ONLY: its save is refused ('read-only') and no store changes
import { launch, assert } from './harness.mjs';
import { newProfileDir } from './profile-root.mjs';
const ok = (n) => console.log('PASS ' + n);
const MARK = 'STORE-SAFETY-MARKER-7741', COORD = 'plc-encounters-coord', LEDGER = 'plc.encounters.v1';
const h = await launch({ port: 18577, profileDir: newProfileDir('store-safety') });
const { context, origin } = h; let page = h.page;
const ready = async (p = page) => { await p.waitForSelector('#messageInput'); await p.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 20000 }); await p.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const done = (p = page) => p.waitForFunction(() => /^(Response complete\.|Response stopped|The response was interrupted|The response reached)/.test(document.querySelector('#generationStatus').textContent), null, { timeout: 20000 });
const send = async (p, text) => { await p.fill('#messageInput', text); await p.click('#sendBtn'); };
const openSettings = async (section) => { if (!await page.locator('#settingsPage').isVisible()) { await page.click('button[aria-label="This device menu"]'); await page.click('.shell-pop-row:has-text("Settings")'); } await page.click(`.settings-nav-item[data-section="${section}"]`); };
const closeSettings = async () => { if (await page.locator('#settingsPage').isVisible()) await page.click('button[aria-label="Close settings"]'); };
const dump = (p = page) => p.evaluate(async () => {
  const out = { local: {}, idb: {} };
  for (let i = 0; i < localStorage.length; i++) out.local[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
  for (const { name } of await indexedDB.databases()) {
    const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    out.idb[name] = {};
    for (const store of [...db.objectStoreNames]) out.idb[name][store] = await new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    db.close();
  }
  return out;
});
const text = (o) => JSON.stringify(o);
const last = (p) => p.evaluate(() => window.plcApp.encounters.lastResult());
const newTab = async (init) => {
  const p = await context.newPage(); p.on('pageerror', (e) => h.errors.push(e.message));
  await p.addInitScript(({ endpoint }) => { if (!sessionStorage.getItem('chatConfig')) sessionStorage.setItem('chatConfig', JSON.stringify({ endpoint, token: '', model: 'fake-model', theme: 'light' })); if (!sessionStorage.getItem('chatModels')) sessionStorage.setItem('chatModels', JSON.stringify(['fake-model'])); }, { endpoint: `http://127.0.0.1:${h.api.port}/v1` });
  if (init) await p.addInitScript(init);
  await p.goto(origin + '/'); await ready(p); return p;
};
try {
  await ready();
  // ---- 1 plain, two tabs, real IndexedDB ----
  await send(page, 'first tab ' + MARK); await done(page);
  const tab2 = await newTab();                                   // loaded after the first save: it opens the same conversation from the list (two tabs on one chat)
  await tab2.locator('#threadList li .thread-name').first().click(); await tab2.waitForFunction((m) => [...document.querySelectorAll('.message.user')].some((n) => n.textContent.includes(m)), 'first tab ' + MARK, { timeout: 15000 });
  await send(tab2, 'second tab ' + MARK); await done(tab2);
  await send(page, 'first tab again ' + MARK); await done(page);
  const r1 = await last(page), r2 = await last(tab2);
  assert(r1.ok && r2.ok && !r1.conflicts.length && !r2.conflicts.length, 'both tabs were acknowledged without conflict: ' + JSON.stringify([r1, r2]));
  await page.waitForTimeout(300);
  let d = await dump(); const rec = d.idb[COORD]?.state?.[0];
  assert(rec && rec.v === 1 && rec.state === 'stable' && Number.isSafeInteger(rec.gen) && rec.gen >= 2, 'a stable coordination record exists in IndexedDB: ' + text(rec));
  assert(Object.values(rec.keys).every((x) => /^[0-9a-f]{64}$/.test(x)) && Object.keys(rec.keys).sort().join() === 'chatThreads,' + LEDGER, 'it names SHA-256 digests of the two stores only');
  assert(!text(rec).includes(MARK) && !text(rec).includes('Reply to'), 'no payload in the record');
  const stored = JSON.parse(d.local.chatThreads); const all = stored.flatMap((t) => t.messages.map((m) => m.content));
  assert(['first tab ', 'second tab ', 'first tab again '].every((p) => all.some((c) => c === p + MARK)), 'every acknowledged message is stored: ' + all.join('|'));
  ok('1 plain, two tabs: acknowledged, stable digest-only record in real IndexedDB, nothing lost');

  // ---- 2 the record store unavailable in one tab: a definite refusal ----
  const bad = await newTab(() => { const o = IDBFactory.prototype.open; IDBFactory.prototype.open = function (name, v) { if (name === 'plc-encounters-coord') { const r = {}; setTimeout(() => { r.error = new DOMException('refused by the test', 'InvalidStateError'); if (r.onerror) r.onerror(); }, 0); return r; } return o.apply(this, arguments); }; });
  const before = await bad.evaluate((L) => [localStorage.getItem('chatThreads'), localStorage.getItem(L)], LEDGER);
  await send(bad, 'must not be saved ' + MARK); await bad.waitForTimeout(1500);
  const rb = await last(bad);
  assert(rb && rb.ok === false && rb.code === 'coordination-unavailable', 'the tab with no usable record store refuses: ' + text(rb));
  const after = await bad.evaluate((L) => [localStorage.getItem('chatThreads'), localStorage.getItem(L)], LEDGER);
  assert(text(before) === text(after), 'a refusal wrote nothing to either store');
  await bad.close();
  await send(page, 'a tab without the fault still saves ' + MARK); await done(page); assert((await last(page)).ok === true, 'the healthy tab is acknowledged');
  ok('2 record store unavailable: definite refusal, bytes unchanged, other tabs unaffected');
  await tab2.close();

  // ---- 3 the encrypted vault ----
  await openSettings('security'); await page.click('.set-row:has-text("App lock") button');
  await page.check('#lockEncrypt'); await page.fill('#lockNew1', 'correct horse'); await page.fill('#lockNew2', 'correct horse'); await page.click('.app-dialog button:has-text("Lock the app")');
  await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")', { timeout: 30000 }); await page.click('.app-dialog button:has-text("Remove it")');
  await page.waitForFunction(() => !localStorage.getItem('chatThreads'), null, { timeout: 20000 });
  await closeSettings();
  await send(page, 'vault message ' + MARK); await done(page); await page.waitForTimeout(1500);
  assert((await last(page)).ok === true, 'a save under the vault is acknowledged: ' + text(await last(page)));
  d = await dump();
  assert(!text(d).includes(MARK), 'the marker is nowhere at rest (local storage or any IndexedDB record)');
  assert(!(d.idb[COORD]?.state?.length), 'no coordination record (no digest of the old plaintext) remains with the vault on: ' + text(d.idb[COORD]));
  assert(d.local['plc.vault.v1'] && d.idb['plc-vault']?.log?.length > 2, 'the data went to the vault');
  ok('3a vault on: no coordination record, nothing readable at rest, saves acknowledged');
  const seq = () => page.evaluate(async () => { const m = await import('/releases/' + window.APP_BUILD.commit + '/chat/vault/vault-store.mjs'); return m.app.vaultSession.lastSeq; });
  await page.reload(); await page.waitForSelector('#lockScreen', { state: 'visible' }); await page.fill('#unlockPass', 'correct horse'); await page.press('#unlockPass', 'Enter'); await page.waitForSelector('#lockScreen', { state: 'hidden' }); await ready();
  await page.waitForFunction((m) => [...document.querySelectorAll('.message.user')].some((n) => n.textContent.includes(m)), 'vault message ' + MARK, { timeout: 15000 });
  ok('3b reload with the passphrase shows the acknowledged message');
  const second = await context.newPage();
  await second.addInitScript(() => { window.addEventListener('plc:vault-readonly', () => { window.__ro = (window.__ro || 0) + 1; }); });
  await second.goto(origin + '/'); await second.waitForSelector('#lockScreen', { state: 'visible' }); await second.fill('#unlockPass', 'correct horse'); await second.press('#unlockPass', 'Enter'); await second.waitForSelector('#lockScreen', { state: 'hidden' });
  await second.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 20000 });
  const s0 = await seq(), vlog = (await dump()).idb['plc-vault'].log.length;
  await send(second, 'typed in the read-only tab ' + MARK); await second.waitForFunction(() => window.__ro >= 1, null, { timeout: 20000 }); await second.waitForTimeout(800);
  const rs = await last(second);
  assert(rs && rs.ok === false && rs.code === 'read-only', 'the second tab\'s save is refused as read-only: ' + text(rs));
  assert((await seq()) === s0 && (await dump()).idb['plc-vault'].log.length === vlog, 'the encrypted store did not change');
  assert(!text(await dump()).includes('read-only tab'), 'nothing of the refused text is at rest');
  await second.close();
  await send(page, 'the writer tab still saves ' + MARK); await done(page); assert((await last(page)).ok === true, 'the exclusive writer still saves');
  ok('3c second tab read-only: refused, encrypted store unchanged; the writer tab continues');
  const pe = h.errors.filter((e) => !/ResizeObserver|API responded with status 500|network error/.test(e)); assert(pe.length === 0, 'no page errors: ' + pe.join(' | '));
} catch (e) {
  for (const p of context.pages()) console.error('PAGE', p.url(), await p.evaluate(() => ({ status: document.querySelector('#generationStatus')?.textContent, body: document.body.innerText.slice(-400), last: JSON.stringify(window.plcApp?.encounters?.lastResult?.()), stored: localStorage.getItem('chatThreads')?.slice(0, 700) })).catch((x) => String(x)));
  console.error('PAGEERRORS', h.errors); throw e;
} finally { await h.close(); }
console.log('ALL PASS');
