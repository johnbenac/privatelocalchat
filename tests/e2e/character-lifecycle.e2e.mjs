// Rich characters: lifecycle and refusal qualification in the whole app, in a real browser. Everything that changes anything is a visible control; reads of storage and of the page are
// observations only. Races are forced by holding the REAL SHA-256 digest the producer validators need (the digest then runs for real after release), by choosing when a file picker
// answers, or by the person's own visible actions (turn the vault on or off, leave a temporary chat, Lock now). Seeding a malformed, newer or full store is the stated precondition of
// the refusal cases (it is what another version or a full disk leaves behind); the writers under test are always the visible controls.
//   node scripts/e2e.mjs character-lifecycle
// E2E_PORT_OFFSET moves the port (base 18581); PLC_E2E_PROFILE_ROOT names the profile folder; PLC_LIFECYCLE_EVIDENCE a folder the JSON evidence is written to.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { launch, assert } from './harness.mjs';
import { newProfileDir } from './profile-root.mjs';
import { openAuthored, exportAuthored } from '../../chat/characters/vendor/t415/contracts/authored-profiles/authored.mjs';

const ok = (n) => console.log('PASS ' + n);
const fx = new URL('../fixtures/characters/', import.meta.url);
const text = (p) => readFileSync(new URL(p, fx), 'utf8');
const bin = (p) => new Uint8Array(readFileSync(new URL(p, fx)));
const bundles = Object.fromEntries(['minimal', 'neri', 'bex'].map((n) => [n, text(`examples/${n}.bundle.json`)]));
const resources = { card: bin('resources/tide-card.txt'), chart: bin('resources/chart.png') };
const evidence = { suite: 'character-lifecycle', scope: 'whole app, real browser, real crypto/Web Locks/storage; races forced by holding the real digest or the file picker', scenarios: {} };
const evidenceDir = process.env.PLC_LIFECYCLE_EVIDENCE || null;
const hasherFactory = () => { const h = createHash('sha256'); return { update: (c) => { h.update(c); }, digest: () => new Uint8Array(h.digest()) }; };
const opened = await openAuthored(bundles.neri, { crypto: webcrypto });
const externalNeri = JSON.stringify(await exportAuthored(opened.document, opened.registry, { selection: opened.selection, visibility: opened.visibility, audience: opened.audience, byteMode: 'external', readAsset: async (hh) => (async function* () { yield opened.inlineBytes.get(hh); })(), hasherFactory, crypto: webcrypto }));

// Observation hooks installed before the page starts: a hold on the next real digest (it runs for real after release), the set of live preview addresses, and a storage-full switch.
const hookInit = () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
  window.__blobUrls = new Set(); window.__blobMade = 0;
  URL.createObjectURL = (b) => { const u = create(b); window.__blobUrls.add(u); window.__blobMade += 1; return u; };
  URL.revokeObjectURL = (u) => { window.__blobUrls.delete(u); revoke(u); };
  window.__held = { armed: false, waiting: 0, release: [], count: 0 };
  crypto.subtle.digest = async (...args) => {
    window.__held.count += 1;
    if (window.__held.armed) { window.__held.armed = false; window.__held.waiting += 1; await new Promise((r) => window.__held.release.push(r)); }
    return digest(...args);
  };
  window.__full = false; // the browser's storage is full for the characters key (QuotaExceededError)
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__full && k === 'plc.characters.v1') throw new DOMException('full', 'QuotaExceededError'); return setItem.call(this, k, v); };
};

const h = await launch({ port: 18581, profileDir: newProfileDir('character-lifecycle'), init: hookInit });
const { context } = h; const page = h.page; const origin = h.origin;
const KEY = 'plc.characters.v1';
const PASS = 'correct horse';
const ready = async (p = page) => { await p.waitForSelector('#messageInput'); await p.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 20000 }); await p.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const stored = (p = page) => p.evaluate((k) => localStorage.getItem(k), KEY);
const records = async (p = page) => JSON.parse(await stored(p) || '{"records":[]}').records;
const openInstructions = async (p = page) => { if (!await p.locator('#systemPromptInput').isVisible()) { await p.click('#shellPlus'); await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")'); } await p.waitForSelector('#importCharacterBtn', { state: 'visible' }); };
const hold = (p = page) => p.evaluate(() => { window.__held.armed = true; });
const waitHeld = (n, p = page) => p.waitForFunction((x) => window.__held.waiting >= x, n, { timeout: 20000 });
const heldTotal = (p = page) => p.evaluate(() => window.__held.waiting);
const releaseHeld = (p = page) => p.evaluate(() => { for (const r of window.__held.release.splice(0)) r(); });
const choose = async (name, content, p = page) => { const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#importCharacterBtn')]); await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) }); };
const dialogs = (p = page) => p.evaluate(() => [...document.querySelectorAll('.app-dialog')].map((d) => ({ title: d.querySelector('h2,h3,.dialog-title')?.textContent || '', private: /Neri|Pip|Bex/.test(d.textContent) })));
const reviewCount = (p = page) => p.locator('.app-dialog:has-text("Review character")').count();
const noDialog = (p = page) => p.waitForFunction(() => !document.querySelector('.app-dialog'));
const closeAll = async (p = page) => { for (let i = 0; i < 8 && await p.locator('.app-dialog').count(); i++) { await p.locator('.app-dialog').last().locator('button:has-text("Cancel"), button:has-text("Done"), button:has-text("Close"), button:has-text("OK")').first().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(80); } }; // the topmost dialog first
const save = async (p = page) => { await p.click('.app-dialog .dialog-actions .primary'); await noDialog(p); };
const urlsLive = (p = page) => p.evaluate(() => window.__blobUrls.size);
const openSettings = async (section, p = page) => { if (!await p.locator('#settingsPage').isVisible()) { await p.click('button[aria-label="This device menu"]'); await p.click('.shell-pop-row:has-text("Settings")'); } await p.click(`.settings-nav-item[data-section="${section}"]`); };
const closeSettings = async (p = page) => { if (await p.locator('#settingsPage').isVisible()) await p.click('button[aria-label="Close settings"]'); };
const unlock = async (pass = PASS, p = page) => { await p.fill('#unlockPass', pass); await p.press('#unlockPass', 'Enter'); await p.waitForSelector('#lockScreen', { state: 'hidden' }); await ready(p); };
const openLibrary = async (p = page) => { await openInstructions(p); await p.click('#savedCharactersBtn'); await p.waitForSelector('.app-dialog:has-text("Saved characters")'); };
let vaultOn = false;
const toggleVault = async () => {
  await openSettings('security'); await page.click('.set-row:has-text("App lock") button');
  if (!vaultOn) {
    await page.check('#lockEncrypt'); await page.fill('#lockNew1', PASS); await page.fill('#lockNew2', PASS); await page.click('.app-dialog button:has-text("Lock the app")');
    await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")', { timeout: 30000 }); await page.click('.app-dialog button:has-text("Remove it")');
    await page.waitForFunction(() => !localStorage.getItem('chatThreads'), null, { timeout: 20000 });
  } else {
    await page.fill('#lockCurrent', PASS); await page.click('.app-dialog button:has-text("Turn encryption off")'); await page.click('.app-dialog button:has-text("Turn it off")');
    await page.waitForFunction(() => /Encryption is off/.test(document.body.innerText), null, { timeout: 30000 });
  }
  vaultOn = !vaultOn; await closeSettings();
};
const dump = (p = page) => p.evaluate(async () => { const out = { local: {}, session: {}, idb: {} }; for (let i = 0; i < localStorage.length; i++) out.local[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
  for (let i = 0; i < sessionStorage.length; i++) out.session[sessionStorage.key(i)] = sessionStorage.getItem(sessionStorage.key(i));
  for (const { name } of await indexedDB.databases()) { const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); out.idb[name] = {};
    for (const store of [...db.objectStoreNames]) out.idb[name][store] = await new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); db.close(); } return out; });
const record = (name, data) => { evidence.scenarios[name] = data; };
const quiet = (ms = 1500) => page.waitForTimeout(ms);
const rootOf = (n) => JSON.parse(bundles[n]).root;
const addVisible = async (name, content, p = page) => { await openInstructions(p); await choose(name, content, p); await p.waitForSelector('.app-dialog:has-text("Review character")'); await save(p); };

try {
  await ready();
  await page.click('#newChatBtn');
  assert(await stored() === null, 'no saved characters to start with');

  // S0. setup: two saved characters through the visible writer
  await addVisible('neri.bundle.json', bundles.neri); await addVisible('pip.bundle.json', bundles.minimal);
  const base = await records(); const neriId = base.find((r) => r.preview.name === 'Neri').individualId;
  assert(base.length === 2, 'two characters saved to start with');
  const baseText = await stored();

  // S1. the reported defect in the whole app: an import is still validating (its real digest is held) when the vault state changes; the review must never open afterwards.
  const s1 = {};
  await openInstructions(); await hold(); await choose('neri.bundle.json', bundles.neri); await waitHeld(1);
  await toggleVault(); // vault turned ON: the lifecycle epoch moves
  await releaseHeld(); await quiet();
  s1.vaultOn = { review: await reviewCount(), dialogs: await dialogs(), saved: (await records()).length };
  assert(s1.vaultOn.review === 0 && !s1.vaultOn.dialogs.some((d) => d.private), 'S1a: a review prepared before the vault was turned on never opens: ' + JSON.stringify(s1.vaultOn.dialogs));
  await closeAll();
  await openInstructions(); await hold(); await choose('neri.bundle.json', bundles.neri); await waitHeld(2);
  await toggleVault(); // vault turned OFF (vault:locked with off): the epoch moves again
  await releaseHeld(); await quiet();
  s1.vaultOff = { review: await reviewCount(), dialogs: await dialogs() };
  assert(s1.vaultOff.review === 0 && !s1.vaultOff.dialogs.some((d) => d.private), 'S1b: a review prepared before the vault was turned off never opens: ' + JSON.stringify(s1.vaultOff.dialogs));
  assert(await stored() === baseText, 'S1: nothing was saved by any held import');
  record('s1-import-held-then-vault-change', s1); await closeAll();
  ok('S1: import held in validation, vault turned on / off, released: no review ever appears and nothing is saved');

  // S2. Details held while reopening, vault turned on and (after the release) off: the details never open
  const s2 = {};
  await openLibrary(); await hold();
  await page.locator(`.char-item[data-individual="${neriId}"] button:has-text("Details")`).click(); await waitHeld(3);
  await closeAll(); await toggleVault();
  await releaseHeld(); await quiet();
  s2.afterOn = { details: await page.locator('.char-details').count(), dialogs: await dialogs(), urls: await urlsLive() };
  assert(s2.afterOn.details === 0 && !s2.afterOn.dialogs.some((d) => d.private) && s2.afterOn.urls === 0, 'S2a: held Details does not open after the vault was turned on: ' + JSON.stringify(s2.afterOn));
  await openLibrary(); await hold();
  await page.locator(`.char-item[data-individual="${neriId}"] button:has-text("Details")`).click(); await waitHeld(4);
  await closeAll(); await toggleVault();
  await releaseHeld(); await quiet();
  s2.afterOff = { details: await page.locator('.char-details').count(), dialogs: await dialogs(), urls: await urlsLive() };
  assert(s2.afterOff.details === 0 && !s2.afterOff.dialogs.some((d) => d.private) && s2.afterOff.urls === 0, 'S2b: held Details does not open after the vault was turned off, and no preview address was left: ' + JSON.stringify(s2.afterOff));
  record('s2-details-held-then-vault-change', s2);
  ok('S2: Details held while reopening, vault changed, released: nothing private is drawn and no preview address is left');

  // S3. file pickers: cancelled / ended scopes ignore a late answer
  const s3 = {};
  await openInstructions(); await choose('neri.external.json', externalNeri);
  await page.waitForSelector('.app-dialog:has-text("Choose the package’s files")');
  const answer = async (chooser, label) => { try { await chooser.setFiles([{ name: 'tide-card.txt', mimeType: 'text/plain', buffer: Buffer.from(resources.card) }, { name: 'chart.png', mimeType: 'image/png', buffer: Buffer.from(resources.chart) }]); return 'answered'; } catch (e) { return 'refused by the browser: ' + String(e.message).split('\n')[0]; } };
  { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.app-dialog button:has-text("Choose files…")')]);
    await page.click('.app-dialog button:has-text("Cancel")'); await noDialog();
    s3.afterCancel = { setFiles: await answer(chooser), }; await quiet(1000);
    s3.afterCancel.review = await reviewCount(); s3.afterCancel.dialogs = await dialogs();
    assert(s3.afterCancel.review === 0 && s3.afterCancel.dialogs.length === 0, 'S3a: files chosen after Cancel are ignored: ' + JSON.stringify(s3.afterCancel)); }
  await openInstructions(); await choose('neri.external.json', externalNeri);
  await page.waitForSelector('.app-dialog:has-text("Choose the package’s files")');
  { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.app-dialog button:has-text("Choose files…")')]);
    await closeAll(); // the resource step was closed (by the person), then the vault state changes while the picker is still open
    await toggleVault(); s3.afterVault = { setFiles: await answer(chooser) }; await quiet(1000);
    s3.afterVault.review = await reviewCount(); s3.afterVault.dialogs = await dialogs();
    assert(s3.afterVault.review === 0 && s3.afterVault.dialogs.length === 0, 'S3b: files chosen after the vault changed are ignored: ' + JSON.stringify(s3.afterVault)); }
  // (a lifecycle change that closes an open resource step by itself cannot be reached from the page while that modal is open; it is covered at the component level in tests/character-ui-lifecycle.test.mjs)
  record('s3-pickers', s3);
  // a plain import picker answering after the vault changed
  { await openInstructions(); const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#importCharacterBtn')]);
    await toggleVault();
    await chooser.setFiles({ name: 'pip.json', mimeType: 'application/json', buffer: Buffer.from(bundles.minimal) }).catch(() => {}); await quiet(1000);
    const late = { review: await reviewCount(), dialogs: await dialogs() };
    assert(late.review === 0 && !late.dialogs.some((d) => d.private), 'S3c: a package chosen after the vault changed is not read or reviewed: ' + JSON.stringify(late));
    evidence.scenarios['s3-pickers'].importAfterVault = late; await closeAll(); }
  ok('S3: file-picker answers after Cancel or a vault change are ignored; the resource step is a tracked private view');

  // S5. temporary chats: a pending import or copy never crosses into another session
  const s5 = {};
  if (vaultOn) await toggleVault();
  const normalBefore = await stored();
  await page.click('button[aria-label="Temporary chat"], button[title="Temporary chat"]'); await page.waitForFunction(() => document.body.classList.contains('view-temp'));
  await openInstructions(); await hold(); const t0 = await heldTotal(); await choose('pip.bundle.json', bundles.minimal); await waitHeld(t0 + 1);
  await page.click('button[aria-label="Leave temporary chat"], button[title="Leave temporary chat"]'); await page.waitForFunction(() => !document.body.classList.contains('view-temp'));
  await releaseHeld(); await quiet();
  s5.tempToNormal = { review: await reviewCount(), dialogs: await dialogs(), stored: (await stored()) === normalBefore };
  assert(s5.tempToNormal.review === 0 && s5.tempToNormal.stored, 'S5a: an import started in a temporary chat does not open in the normal chat: ' + JSON.stringify(s5.tempToNormal.dialogs));
  await closeAll();
  // temp A -> normal -> temp B
  await page.click('button[aria-label="Temporary chat"], button[title="Temporary chat"]'); await page.waitForFunction(() => document.body.classList.contains('view-temp'));
  await openInstructions(); await choose('pip.bundle.json', bundles.minimal); await page.waitForSelector('.app-dialog:has-text("Review character")'); await save();
  await openLibrary(); assert(await page.locator('.char-item').count() === 1, 'temporary chat A holds the character it made'); await hold(); const t1 = await heldTotal();
  await page.locator('.char-item button:has-text("Make a copy")').click(); await waitHeld(t1 + 1);
  await closeAll();
  await page.click('button[aria-label="Leave temporary chat"], button[title="Leave temporary chat"]'); await page.waitForFunction(() => !document.body.classList.contains('view-temp'));
  await page.click('button[aria-label="Temporary chat"], button[title="Temporary chat"]'); await page.waitForFunction(() => document.body.classList.contains('view-temp'));
  await releaseHeld(); await quiet();
  await openLibrary(); s5.tempB = { items: await page.locator('.char-item').count(), dialogs: await dialogs() };
  assert(s5.tempB.items === 0, 'S5b: a copy held in temporary chat A does not land in temporary chat B: ' + s5.tempB.items);
  await closeAll();
  await page.click('button[aria-label="Leave temporary chat"], button[title="Leave temporary chat"]'); await page.waitForFunction(() => !document.body.classList.contains('view-temp'));
  assert(await stored() === normalBefore, 'S5: nothing reached persistent storage from any temporary session');
  assert(await urlsLive() === 0, 'S5: no preview address is left');
  record('s5-temporary-sessions', s5);
  ok('S5: temp A -> normal and temp A -> normal -> temp B: held import/copy results are dropped, nothing persists');

  // S6. preview addresses: every one made is revoked (review, details, cancel, vault change with a view open)
  const s6 = {};
  await openInstructions(); await choose('neri.bundle.json', bundles.neri); await page.waitForSelector('.app-dialog:has-text("Review character")');
  s6.reviewOpen = await urlsLive(); assert(s6.reviewOpen >= 1, 'a picture preview made an address');
  await page.click('.app-dialog button:has-text("Cancel")'); await noDialog(); s6.afterCancel = await urlsLive(); assert(s6.afterCancel === 0, 'Cancel revoked every preview address');
  await openLibrary(); await page.locator(`.char-item[data-individual="${neriId}"] button:has-text("Details")`).click(); await page.waitForSelector('.char-details img');
  s6.detailsOpen = await urlsLive(); assert(s6.detailsOpen >= 1, 'details made an address');
  await closeAll(); s6.afterClose = await urlsLive(); assert(s6.afterClose === 0, 'closing details and the library revoked every address: ' + JSON.stringify({ s6, open: await dialogs() }));
  // a vault change with a review open (the review is the person's current view when the page is left to lock)
  await openInstructions(); await choose('bex.bundle.json', bundles.bex); await page.waitForSelector('.app-dialog:has-text("Review character")'); await page.waitForSelector('.app-dialog audio');
  s6.bexOpen = await urlsLive(); await closeAll(); s6.bexClosed = await urlsLive(); assert(s6.bexClosed === 0, 'sound preview address revoked');
  s6.made = await page.evaluate(() => window.__blobMade);
  record('s6-preview-addresses', s6);
  ok('S6: every preview address made is revoked on cancel, close and (S2/S5) lifecycle events');

  // S7. refusals: malformed, newer, full storage and read-only leave the stored text exactly as it was, and the proposal stays for retry
  const s7 = {};
  const refuseSave = async (label, expectText, mustStay) => {
    await openInstructions(); await choose('pip.bundle.json', bundles.minimal); await page.waitForSelector('.app-dialog:has-text("Review character")');
    const disabled = await page.locator('.app-dialog .dialog-actions .primary').isDisabled();
    if (!disabled) await page.click('.app-dialog .dialog-actions .primary');
    await page.waitForFunction((rx) => new RegExp(rx).test(document.querySelector('.app-dialog .char-status')?.textContent || ''), expectText, { timeout: 15000 });
    const status = await page.locator('.app-dialog .char-status').innerText();
    s7[label] = { saveDisabledFromStart: disabled, status, reviewStillOpen: await reviewCount() === 1 };
    assert(await reviewCount() === 1, label + ': the proposal stays open');
    assert(await stored() === mustStay, label + ': stored text is byte-for-byte unchanged');
    return status;
  };
  const cancelReview = async () => { await page.click('.app-dialog button:has-text("Cancel")'); await noDialog(); };
  const goodText = await stored();
  // 7a malformed store
  await page.evaluate((k) => localStorage.setItem(k, '{"format":1,"revision":"x","records":['), KEY); const malformedText = await stored();
  await page.reload(); await ready(); await closeAll();
  await refuseSave('malformed', 'not in a form this version can read', malformedText); await cancelReview();
  await openLibrary(); assert(/not in a form this version can read/.test(await page.locator('.char-library').innerText()), 'the library says so'); await closeAll();
  // 7b newer store
  const newerText = JSON.stringify({ format: 2, revision: 9, records: [], future: true });
  await page.evaluate(([k, t]) => { localStorage.setItem(k, t); localStorage.setItem('plc.formats.v1', JSON.stringify({ v: 1, formats: { [k]: 2 } })); }, [KEY, newerText]);
  await page.reload(); await ready(); await closeAll();
  await refuseSave('newer', 'newer version', newerText); await cancelReview();
  assert(JSON.parse(await page.evaluate(() => localStorage.getItem('plc.formats.v1'))).formats[KEY] === 2, 'the record of the newer format is untouched');
  // 7c full storage: the proposal is kept and a retry after space is freed saves exactly one
  await page.evaluate(([k, t]) => { localStorage.setItem(k, t); localStorage.removeItem('plc.formats.v1'); }, [KEY, goodText]);
  await page.reload(); await ready(); await closeAll();
  await page.evaluate(() => { window.__full = true; });
  await refuseSave('full', 'may be full', goodText);
  await page.evaluate(() => { window.__full = false; });
  await page.click('.app-dialog .dialog-actions .primary'); await noDialog();
  s7.full.retryAfterSpace = { saved: (await records()).length };
  assert((await records()).length === 3, 'the retained proposal saved once after space was freed');
  record('s7-refusals', s7);
  ok('S7: malformed, newer and full storage refuse with the stored text unchanged and the proposal kept; the retry saves once');

  // S4. a real encrypted lock: Lock now while an import is validating; nothing private comes back after unlock, nothing falls to plaintext, other tab read-only
  const s4 = {};
  await toggleVault(); // on
  const markers = ['neri', 'bex', 'minimal'].map(rootOf);
  const d0 = JSON.stringify(await dump()); assert(!markers.some((m) => d0.includes(m)), 'S4: with the vault on no saved character is readable at rest');
  await openInstructions(); await hold(); const t2 = await heldTotal(); await choose('bex.bundle.json', bundles.bex); await waitHeld(t2 + 1);
  await page.click('#lockNowBtn');
  await page.waitForSelector('#lockScreen', { state: 'visible', timeout: 20000 });
  s4.lockedPage = { hasPrivateText: /Neri|Pip|Bex/.test(await page.content()), reviewDialogs: await page.locator('.app-dialog').count() };
  assert(!s4.lockedPage.hasPrivateText && s4.lockedPage.reviewDialogs === 0, 'S4: the locked page shows nothing private');
  await unlock(); await quiet(1000);
  s4.afterUnlock = { review: await reviewCount(), dialogs: await dialogs(), localKey: await stored(), urls: await urlsLive() };
  assert(s4.afterUnlock.review === 0 && s4.afterUnlock.dialogs.length === 0 && s4.afterUnlock.localKey === null, 'S4: after unlock no old review comes back and nothing was written to plain storage');
  const d1 = JSON.stringify(await dump()); assert(!markers.some((m) => d1.includes(m)), 'S4: nothing readable at rest after lock/unlock');
  await openLibrary(); s4.library = await page.locator('.char-item').count(); assert(s4.library === 3, 'the saved characters are all back after unlock: ' + s4.library); await closeAll();
  // writer flush / reload, and the second unlocked tab is read-only
  await addVisible('bex.again.json', bundles.bex); await quiet(1500);
  const d2 = JSON.stringify(await dump()); assert(!d2.includes(rootOf('bex')) && !JSON.parse(d2).local[KEY], 'S4: the new character is not readable at rest');
  await page.reload(); await page.waitForSelector('#lockScreen', { state: 'visible' }); await unlock();
  await openLibrary(); assert(await page.locator('.char-item').count() === 4, 'the writer\'s flushed save survives a reload'); await closeAll();
  const other = await context.newPage(); await other.goto(origin + '/'); await other.waitForSelector('#lockScreen', { state: 'visible' }); await unlock(PASS, other); await openInstructions(other);
  await choose('ro.json', bundles.minimal, other); await other.waitForSelector('.app-dialog:has-text("Review character")');
  await other.waitForFunction(() => /open in another tab/.test(document.querySelector('.app-dialog .char-status')?.textContent || ''));
  s4.otherTab = { saveDisabled: await other.locator('.app-dialog .dialog-actions .primary').isDisabled(), status: await other.locator('.app-dialog .char-status').innerText() };
  assert(s4.otherTab.saveDisabled, 'S4: a second unlocked tab is read-only and cannot save');
  await openLibrary(other).catch(() => {}); await other.close();
  record('s4-encrypted-lock', s4);
  ok('S4: real Lock now during validation: no private view after unlock, no plaintext fallback, flush/reload keeps the save, the second tab is read-only');

  assert(h.errors.length === 0, 'no page errors: ' + h.errors.join(' | '));
  console.log('character-lifecycle e2e: ok');
} catch (e) { console.error(e); console.error(await page.locator('.app-dialog').innerText().catch(() => '')); process.exitCode = 1; }
finally {
  if (evidenceDir) { mkdirSync(evidenceDir, { recursive: true }); writeFileSync(evidenceDir + '/character-lifecycle-evidence.json', JSON.stringify(evidence, null, 2)); }
  await h.close();
}
