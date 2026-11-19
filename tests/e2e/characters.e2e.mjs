// Rich characters, end to end in a real browser with the producer's real packages (tests/fixtures/characters/): Pip (minimal), Neri (lore, guidance, prepared, presentation,
// media, evidence, a picture and a text file) and Bex (an optional sound and an unfamiliar optional profile). Everything is driven through visible controls; reads of storage
// and of the page are observations only. A file or a link is only REVIEWED until the person presses Save; a chosen update names its target; a copy and a repeat are new
// characters; exact bytes survive a whole reload; refused input changes nothing; external resources come only from files the person chooses; a temporary chat keeps
// nothing; with the encrypted vault nothing readable is left at rest; nothing is fetched and no model is asked.
// The browser profile is a new folder under PLC_E2E_PROFILE_ROOT; E2E_PORT_OFFSET moves the port (base 18481).
//   node scripts/e2e.mjs characters
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { launch, assert } from './harness.mjs';
import { newProfileDir } from './profile-root.mjs';
import { encodeCharacterFragment, CHARACTER_PACKAGE_LIMITS, reviewCharacterPackageFile } from '../../chat/characters/character-package.mjs';
import { encodePresetFragment } from '../../chat/assistant/preset-candidate.mjs';
import { openAuthored, exportAuthored } from '../../vendor/authored-profiles/authored-profiles/index.mjs';

const ok = (n) => console.log('PASS ' + n);
const fx = new URL('../fixtures/characters/', import.meta.url);
const text = (p) => readFileSync(new URL(p, fx), 'utf8');
const bin = (p) => new Uint8Array(readFileSync(new URL(p, fx)));
const bundles = Object.fromEntries(['minimal', 'neri', 'bex'].map((n) => [n, text(`examples/${n}.bundle.json`)]));
const expected = {};
for (const [n, t] of Object.entries(bundles)) expected[n] = (await reviewCharacterPackageFile(t, { crypto: webcrypto })).candidate;
const resources = { card: bin('resources/tide-card.txt'), chart: bin('resources/chart.png'), cue: bin('resources/cue.wav') };
const b64 = (u8) => Buffer.from(u8).toString('base64');
const sha = (b) => 'sha256:' + createHash('sha256').update(b).digest('hex');
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const reroot = (bundle) => { const { root, assets, ...rest } = bundle; bundle.root = sha(new TextEncoder().encode(JSON.stringify(canonical({ ...JSON.parse(JSON.stringify(rest)), assets: assets.map(({ data, ...d }) => d) })))); return JSON.stringify(bundle); };
const aspectOf = (b, id) => b.content.subjects.flatMap((s) => s.aspects || []).find((a) => a.id === id);
const hasherFactory = () => { const h = createHash('sha256'); return { update: (c) => { h.update(c); }, digest: () => new Uint8Array(h.digest()) }; };
const opened = await openAuthored(bundles.neri, { crypto: webcrypto });
const externalNeri = JSON.stringify(await exportAuthored(opened.document, opened.registry, { selection: opened.selection, visibility: opened.visibility, audience: opened.audience, byteMode: 'external', readAsset: async (h) => (async function* () { yield opened.inlineBytes.get(h); })(), hasherFactory, crypto: webcrypto }));

const h = await launch({ port: 18481, profileDir: newProfileDir('characters') });
const { context } = h; let page = h.page; const origin = h.origin;
const outside = []; context.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== origin && !/^(data|blob|about):/.test(r.url())) outside.push(r.method() + ' ' + r.url()); });
const KEY = 'plc.characters.v1';
const ready = async (p = page) => { await p.waitForSelector('#messageInput'); await p.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 20000 }); await p.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const stored = (p = page) => p.evaluate((k) => localStorage.getItem(k), KEY);
const records = async (p = page) => JSON.parse(await stored(p) || '{"records":[]}').records;
const openInstructions = async (p = page) => { if (!await p.locator('#systemPromptInput').isVisible()) { await p.click('#shellPlus'); await p.click('.shell-pop .shell-pop-row:has-text("Instructions for this chat")'); } await p.waitForSelector('#importCharacterBtn', { state: 'visible' }); };
const chooseFile = async (name, content, p = page) => { const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#importCharacterBtn')]); await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) }); };
const review = (p = page) => p.locator('.app-dialog:has-text("Review character")');
const dismissAlert = async (p = page) => { await p.click('.app-dialog button:has-text("OK")'); await p.waitForFunction(() => !document.querySelector('.app-dialog')); };
const noDialog = (p = page) => p.waitForFunction(() => !document.querySelector('.app-dialog'));
const save = async (p = page) => { await p.click('.app-dialog .dialog-actions .primary'); await noDialog(p); };
const requestsToModel = () => fetch(`http://127.0.0.1:${h.api.port}/__requests`).then((r) => r.json());
const dump = () => page.evaluate(async () => { const out = { local: {}, session: {}, idb: {} }; for (let i = 0; i < localStorage.length; i++) out.local[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
  for (let i = 0; i < sessionStorage.length; i++) out.session[sessionStorage.key(i)] = sessionStorage.getItem(sessionStorage.key(i));
  for (const { name } of await indexedDB.databases()) { const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); out.idb[name] = {};
    for (const store of [...db.objectStoreNames]) out.idb[name][store] = await new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); db.close(); } return out; });
const refused = async (label, name, content, pattern) => {
  const before = await stored(); await chooseFile(name, content);
  await page.waitForSelector('.app-dialog:has-text("Character not added")');
  const said = await page.locator('.app-dialog').innerText();
  assert(pattern.test(said), label + ': message ' + said);
  console.log('  refusal [' + label + ']: ' + said.replace(/\s+/g, ' ').slice(0, 220));
  assert(await review().count() === 0, label + ': no review box is offered');
  await dismissAlert(); assert(await stored() === before, label + ': saved characters are byte-for-byte unchanged');
};
const openLibrary = async (p = page) => { await openInstructions(p); await p.click('#savedCharactersBtn'); await p.waitForSelector('.app-dialog:has-text("Saved characters")'); };
const closeDialog = async (p = page) => { await p.click('.app-dialog .dialog-actions .primary'); await noDialog(p); };
const openSettings = async (section) => { if (!await page.locator('#settingsPage').isVisible()) { await page.click('button[aria-label="This device menu"]'); await page.click('.shell-pop-row:has-text("Settings")'); } await page.click(`.settings-nav-item[data-section="${section}"]`); };
const closeSettings = async () => { if (await page.locator('#settingsPage').isVisible()) await page.click('button[aria-label="Close settings"]'); };
const unlock = async (pass) => { await page.fill('#unlockPass', pass); await page.press('#unlockPass', 'Enter'); };
const item = (name) => page.locator(`.char-item:has(.char-name:text-is("${name}"))`);
try {
  await ready();
  const modelBefore = (await requestsToModel()).length;
  await page.click('#newChatBtn'); await openInstructions();
  assert(await stored() === null, 'no saved characters to start with');
  const presetsBefore = await page.evaluate(() => localStorage.getItem('plc.presets.v1'));

  // 1. Pip: review shows the exact name and instructions and writes nothing; cancel writes nothing; Save makes one local character
  await chooseFile('pip.bundle.json', bundles.minimal);
  await review().waitFor();
  assert(await page.inputValue('#charReviewName') === 'Pip', 'the name is shown');
  assert(await page.inputValue('#charReviewText') === expected.minimal.preview.instructions, 'the exact instructions are shown');
  assert(await page.locator('#charReviewText').evaluate((n) => n.readOnly), 'the instructions cannot be edited in the review');
  const pipText = await review().innerText();
  assert(/Nothing has been saved yet/.test(pipText) && /no model is started and nothing is sent anywhere/.test(pipText), 'it says nothing is saved, started or sent');
  assert(/not included in protected backups yet/.test(pipText) && /Keep the original package file/.test(pipText), 'the backup limitation is stated in the review');
  assert(!/\bT\d{2,3}\b/.test(pipText) && !/phase/i.test(pipText), 'no internal task numbers or phases in the product text');
  assert(await page.locator('.char-capability[data-capability="lore"]').getAttribute('data-state') === 'absent', 'lore is not in this package');
  assert(await stored() === null, 'reviewing writes nothing');
  await page.click('.app-dialog button:has-text("Cancel")'); await noDialog();
  assert(await stored() === null, 'cancel writes nothing');
  assert(await page.inputValue('#presetSelect') === '', 'nothing was applied to the open chat');
  await chooseFile('pip.bundle.json', bundles.minimal); await review().waitFor();
  assert(await page.locator('#charPurposeFresh').isChecked() && !await page.locator('#charPurposeUpdate').isChecked(), 'a new character is the default; an update must be chosen');
  await save();
  let recs = await records();
  assert(recs.length === 1 && recs[0].preview.name === 'Pip' && recs[0].recordVersion === 1, 'one new character, version 1');
  assert(/^individual:[0-9a-f-]{36}$/.test(recs[0].individualId), 'it has a local reference of its own: ' + recs[0].individualId);
  assert(recs[0].preview.instructions === expected.minimal.preview.instructions, 'stored instructions are the producer\'s plain projection');
  assert(await page.evaluate(() => localStorage.getItem('plc.presets.v1')) === presetsBefore, 'no preset was created or changed');
  const pipId = recs[0].individualId;
  ok('Pip: review writes nothing, cancel writes nothing, Save makes one new local character');

  // 2. Neri: structured meaning and both files are reviewed; the picture and text are shown by the app; Save
  await chooseFile('neri.bundle.json', bundles.neri); await review().waitFor();
  for (const k of ['lore', 'guidance', 'prepared', 'presentation', 'media', 'evidence']) assert(await page.locator(`.char-capability[data-capability="${k}"]`).getAttribute('data-state') === 'saved', k + ' is saved');
  assert(/Chat does not use it yet/.test(await page.locator('.char-capability[data-capability="lore"]').innerText()), 'it says chat does not use it yet');
  assert(await page.locator('.char-omissions').count() === 1, 'named omissions are listed');
  assert(await page.locator('.char-resource').count() === 2, 'two files come with Neri');
  assert((await page.locator('.char-resource[data-resource="asset:card"] pre').textContent()).trimEnd() === Buffer.from(resources.card).toString('utf8').trimEnd(), 'the text file is shown exactly');
  const img = page.locator('.char-resource[data-resource="asset:chart"] img');
  await img.waitFor(); assert(await img.evaluate((n) => n.complete && n.naturalWidth > 0), 'the picture is drawn by the app from the original bytes');
  assert(await page.locator('.app-dialog audio').count() === 0 && await page.locator('.app-dialog script, .app-dialog iframe, .app-dialog style').count() === 0, 'no audio or active content for Neri');
  await save();
  ok('Neri: structure, text and picture reviewed and saved');

  // 3. Bex: an optional sound with an app-owned player that does not autoplay
  await chooseFile('bex.bundle.json', bundles.bex); await review().waitFor();
  const audio = page.locator('.char-resource[data-resource="asset:cue"] audio');
  await audio.waitFor();
  assert(await audio.evaluate((n) => n.paused && !n.autoplay && n.preload === 'none' && n.controls), 'the sound has controls, is paused, does not autoplay and is not preloaded');
  assert(await page.locator('.char-capability[data-capability="other"]').getAttribute('data-state') === 'kept-unread', 'the unfamiliar part is kept unread and named');
  await save();
  recs = await records();
  assert(recs.length === 3 && new Set(recs.map((r) => r.individualId)).size === 3, 'three characters with three distinct references');
  const byName = (n) => recs.find((r) => r.preview.name === n);
  for (const [name, key] of [['Neri', 'neri'], ['Bex', 'bex']]) {
    const rec = byName(name);
    assert(rec.source.root === JSON.parse(bundles[key]).root, name + ': the package fingerprint is kept');
    assert(JSON.stringify(rec.structured) === JSON.stringify(expected[key].structured), name + ': the structured meaning is kept whole');
  }
  const byHash = (rec) => Object.fromEntries(rec.source.bytes.map((b) => [b.hash, b.data]));
  assert(byHash(byName('Neri'))[sha(resources.card)] === b64(resources.card) && byHash(byName('Neri'))[sha(resources.chart)] === b64(resources.chart), 'Neri: the exact text and PNG bytes are stored');
  assert(byHash(byName('Bex'))[sha(resources.cue)] === b64(resources.cue), 'Bex: the exact WAV bytes are stored');
  ok('Bex: sound player without autoplay; all three characters stored with exact structure and bytes');

  // 4. whole reload: library and details show the same exact bytes and instructions
  const raw = await stored();
  await page.reload(); await ready();
  assert(await stored() === raw, 'the stored characters are identical after a whole reload');
  await openLibrary();
  assert(await page.locator('.char-item').count() === 3, 'the library lists three characters');
  assert(/not included in protected backups yet/.test(await page.locator('.char-library').innerText()), 'the backup limitation is in the library');
  await item('Neri').locator('button:has-text("Details")').click();
  await page.waitForSelector('.app-dialog .char-details');
  const details = page.locator('.char-details');
  assert(await details.locator('#charDetailText').inputValue() === expected.neri.preview.instructions, 'the saved instructions are exact');
  assert(await details.locator('.char-resource[data-resource="asset:card"] pre').textContent().then((t) => t.trimEnd()) === Buffer.from(resources.card).toString('utf8').trimEnd(), 'the text file is exact after reload');
  assert(await details.locator('.char-resource[data-resource="asset:chart"] img').evaluate((n) => n.complete && n.naturalWidth > 0), 'the picture is exact after reload');
  assert(await details.locator('.char-structure[data-structure="guidance"]').count() === 1 && await details.locator('.char-structure[data-structure="prepared"]').count() === 1, 'structured guidance and prepared data are inspectable');
  assert((await details.locator('[data-fact="Local reference"]').innerText()).includes(byName('Neri').individualId), 'the local reference is shown');
  await page.click('.app-dialog:has(.char-details) .dialog-actions .primary'); await page.waitForFunction(() => document.querySelectorAll('.app-dialog').length === 1);
  await item('Bex').locator('button:has-text("Details")').click();
  await page.waitForSelector('.char-details audio'); assert(await page.locator('.char-details audio').evaluate((n) => n.paused), 'the saved sound is paused');
  await page.click('.app-dialog:has(.char-details) .dialog-actions .primary'); await page.waitForFunction(() => document.querySelectorAll('.app-dialog').length === 1);
  await closeDialog();
  ok('whole reload: identical records, exact instructions, text, picture, sound and structure');

  // 5. update: a chosen target keeps its reference and bumps its version; repeats and equal names are new characters; copy is a new character
  await openInstructions(); await chooseFile('bex-again.json', bundles.bex); await review().waitFor();
  assert(await page.locator('#charUpdateTarget').isDisabled(), 'the target list is unavailable until Update is chosen');
  await page.check('#charPurposeUpdate');
  assert(await page.locator('.app-dialog .dialog-actions .primary').isDisabled(), 'Update cannot be pressed without choosing a target');
  assert(/Choose which saved character to update/.test(await page.locator('.char-status').innerText()), 'it asks which to update');
  await page.selectOption('#charUpdateTarget', pipId);
  await save();
  recs = await records();
  const pipNow = recs.find((r) => r.individualId === pipId);
  assert(recs.length === 3 && pipNow.recordVersion === 2 && pipNow.preview.name === 'Bex' && pipNow.lastUpdate.fromRecordVersion === 1, 'the chosen character was updated in place: same reference, version 2, same count');
  assert(recs.filter((r) => r.preview.name === 'Bex').length === 2, 'the other Bex was not touched or merged');
  await chooseFile('neri-again.json', bundles.neri); await review().waitFor();
  assert(!/already/.test(await page.locator('.char-status').innerText()), 'a repeat is not flagged as an update target automatically');
  await save();
  recs = await records();
  assert(recs.length === 4 && recs.filter((r) => r.preview.name === 'Neri').length === 2 && new Set(recs.map((r) => r.individualId)).size === 4, 'the same package again is a second, separate Neri with its own reference');
  await openLibrary();
  await item('Pip').count(); // the updated one is now named Bex
  const copySource = recs.find((r) => r.preview.name === 'Neri');
  await page.locator(`.char-item[data-individual="${copySource.individualId}"] button:has-text("Make a copy")`).click();
  await page.waitForFunction((n) => document.querySelectorAll('.char-item').length === n, 5);
  recs = await records();
  const copy = recs.find((r) => r.origin.purpose === 'copy');
  assert(recs.length === 5 && copy && copy.individualId !== copySource.individualId && copy.origin.copiedFrom.individualId === copySource.individualId && copy.recordVersion === 1, 'a copy is a new character that only records where its design came from');
  assert(JSON.stringify(copy.source.bytes) === JSON.stringify(copySource.source.bytes), 'the copy holds the same exact bytes');
  // remove asks first and then removes only that one
  await page.locator(`.char-item[data-individual="${copy.individualId}"] button:has-text("Remove")`).click();
  await page.waitForSelector('.app-dialog:has-text("Remove saved character")'); await page.click('.app-dialog:has-text("Remove saved character") button:has-text("Cancel")');
  assert((await records()).length === 5, 'cancelling the removal keeps it');
  await page.locator(`.char-item[data-individual="${copy.individualId}"] button:has-text("Remove")`).click();
  await page.click('.app-dialog:has-text("Remove saved character") button:has-text("Remove")');
  await page.waitForFunction((n) => document.querySelectorAll('.char-item').length === n, 4);
  assert((await records()).length === 4 && !(await records()).some((r) => r.individualId === copy.individualId), 'only the chosen character was removed');
  await closeDialog();
  ok('update keeps the chosen reference and bumps its version; repeats and copies are new characters; removal is explicit');

  // 6. a stale update: another tab changes the target after it was chosen; the review keeps the proposal and says so
  const second = await context.newPage(); await second.goto(origin + '/'); await ready(second); await openInstructions(second);
  await openInstructions(); await chooseFile('neri-update.json', bundles.neri); await review().waitFor();
  await page.check('#charPurposeUpdate'); await page.selectOption('#charUpdateTarget', pipId);
  await chooseFile('bex-from-other-tab.json', bundles.bex, second); await review(second).waitFor();
  await second.check('#charPurposeUpdate'); await second.selectOption('#charUpdateTarget', pipId); await save(second);
  assert((await records()).find((r) => r.individualId === pipId).recordVersion === 3, 'the other tab updated it to version 3');
  await page.click('.app-dialog .dialog-actions .primary');
  await page.waitForFunction(() => /changed since you chose it/.test(document.querySelector('.char-status')?.textContent || ''));
  assert(await review().count() === 1, 'the proposal stays open for another try');
  assert((await records()).find((r) => r.individualId === pipId).recordVersion === 3 && (await records()).find((r) => r.individualId === pipId).preview.name === 'Bex', 'the stale update changed nothing');
  await page.selectOption('#charUpdateTarget', pipId); // the list shows the newer version now
  assert(/version 3/.test(await page.locator('#charUpdateTarget option:checked').innerText()), 'the newer version is offered');
  await page.click('.app-dialog button:has-text("Cancel")'); await noDialog();
  await second.close();
  ok('stale update refused with the proposal kept; the other tab\'s change stands');

  // 7. refusals change nothing
  const keep = await stored();
  await refused('malformed', 'x.json', '{"format":', /Malformed bundle JSON/);
  await refused('simple preset', 'x.json', JSON.stringify({ name: 'A', prompt: 'p' }), /Import preset/);
  await refused('oversized', 'big.json', 'x'.repeat(CHARACTER_PACKAGE_LIMITS.fileBytes + 10), /too large/i);
  const tampered = JSON.parse(bundles.neri); aspectOf(tampered, 'aspect:neri-communication').value.manner = 'changed';
  await refused('root tamper', 'tamper.json', JSON.stringify(tampered), /refused.*Nothing was added/is);
  const requires = JSON.parse(bundles.neri); aspectOf(requires, 'aspect:neri-prepared').required = true;
  await refused('required unsupported', 'required.json', reroot(requires), /needs something this version cannot provide.*Nothing was added|refused.*Nothing was added/is);
  const missing = JSON.parse(bundles.neri); delete missing.assets[0].data; missing.assets[0].status = 'missing';
  await refused('missing required bytes', 'missing.json', reroot(missing), /Nothing was added/);
  const badBytes = JSON.parse(bundles.neri); badBytes.assets[0].data = 'AAAA' + badBytes.assets[0].data.slice(4);
  await refused('altered bytes', 'bytes.json', JSON.stringify(badBytes), /refused.*Nothing was added/is);
  assert(await stored() === keep, 'after every refusal the saved characters are exactly as before');
  const optionalMissing = JSON.parse(bundles.bex); delete optionalMissing.assets[0].data; optionalMissing.assets[0].status = 'missing';
  await chooseFile('bex-no-cue.json', reroot(optionalMissing)); await review().waitFor();
  assert(/Not supplied/.test(await page.locator('.char-resource[data-resource="asset:cue"]').innerText()) && /asset:cue: its file was not supplied/.test(await page.locator('.char-omissions').textContent()), 'a missing optional file is named, not hidden');
  await page.click('.app-dialog button:has-text("Cancel")'); await noDialog();
  assert(await stored() === keep, 'reviewing a package with a missing optional file wrote nothing');
  ok('malformed, simple-preset, oversized, tampered, required-unsupported, missing and altered input refuse with no change; a missing optional file is named');

  // 8. links: only a review; metadata only; the address is not rewritten; conflicting payloads open neither
  const link = encodeCharacterFragment(bundles.minimal);
  await page.goto(origin + '/version.json'); await page.goto(origin + '/' + link); await ready();
  await review().waitFor({ timeout: 10000 });
  assert(await page.inputValue('#charReviewName') === 'Pip' && await page.inputValue('#charReviewText') === expected.minimal.preview.instructions, 'the link\'s name and instructions are shown for review');
  assert(/a link/.test(await review().innerText()) && await page.evaluate(() => location.hash) === link, 'the address was not rewritten');
  await page.waitForTimeout(600); assert(await stored() === keep, 'opening the link saved nothing');
  await page.reload(); await ready(); await review().waitFor({ timeout: 10000 }); assert(await stored() === keep, 'a reload shows the review again and still saves nothing');
  await page.click('.app-dialog button:has-text("Cancel")'); await noDialog();
  await page.goto(origin + '/version.json'); await page.goto(origin + '/' + link); await ready(); await review().waitFor();
  await save(); assert((await records()).length === 5, 'saved only by the click');
  const withBytes = encodeCharacterFragment(bundles.neri);
  await page.goto(origin + '/version.json'); await page.goto(origin + '/' + withBytes); await ready();
  await page.waitForSelector('.app-dialog:has-text("Character not added")');
  assert(/cannot carry resource bytes|too long/.test(await page.locator('.app-dialog').innerText()), 'a link with bytes is refused');
  await dismissAlert(); assert((await records()).length === 5, 'the refused link changed nothing');
  const both = '#preset=' + encodePresetFragment({ id: 'p', name: 'Both', prompt: 'x' }).slice('#preset='.length) + '&' + link.slice(1);
  const presets = await page.evaluate(() => localStorage.getItem('plc.presets.v1'));
  await page.goto(origin + '/version.json'); await page.goto(origin + '/' + both); await ready();
  await page.waitForSelector('.app-dialog:has-text("Nothing was added")');
  assert(/both a preset and a character/.test(await page.locator('.app-dialog').innerText()), 'a link naming both is explained');
  assert(await page.locator('.app-dialog:has-text("Review")').count() === 0, 'neither review opened');
  await dismissAlert(); assert(await page.evaluate(() => localStorage.getItem('plc.presets.v1')) === presets && (await records()).length === 5, 'nothing changed');
  await page.goto(origin + '/version.json'); await page.goto(origin + '/' + encodePresetFragment({ id: 'p', name: 'Simple', prompt: 'Be brief.' })); await ready();
  await page.waitForSelector('.app-dialog:has-text("Review preset")'); assert(await review().count() === 0, 'a simple preset link still opens the simple review only');
  await page.click('.app-dialog button:has-text("Cancel")'); await noDialog();
  ok('links: review only, metadata only, address kept, reload safe; bytes in a link refused; conflicting payloads open neither; the simple preset link is unchanged');

  // 9. external resources: only files the person chooses, matched by their own hash
  await page.goto(origin + '/'); await ready(); await openInstructions();
  await chooseFile('neri.external.json', externalNeri);
  await page.waitForSelector('.app-dialog:has-text("Choose the package’s files")');
  const pickFiles = async (files) => { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.app-dialog button:has-text("Choose files…")')]); await chooser.setFiles(files); };
  // the exact stored text is captured BEFORE the wrong files are chosen; the refusals are compared with it byte for byte
  const rawBeforeWrong = await stored(); const recordsBeforeWrong = (await records()).length;
  assert(typeof rawBeforeWrong === 'string' && recordsBeforeWrong === 5, 'external: the existing five characters are in storage before the wrong files are chosen');
  const proposalOpen = async (label) => { assert(await page.locator('.app-dialog:has-text("Choose the package’s files")').count() === 1 && await review().count() === 0, label + ': the file request stays open and no review of the package was offered'); };
  await pickFiles([{ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('x'.repeat(86)) }, { name: 'wrong.png', mimeType: 'image/png', buffer: Buffer.from('y'.repeat(76)) }]);
  await page.waitForFunction(() => /not the ones this package describes/.test(document.querySelector('.char-status')?.textContent || ''));
  assert(await stored() === rawBeforeWrong, 'wrong files: the saved characters are byte-for-byte what they were before the picker');
  assert((await records()).length === recordsBeforeWrong, 'wrong files: the count is still ' + recordsBeforeWrong);
  await proposalOpen('wrong files');
  await pickFiles([{ name: 'huge.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(1048576 + 1) }]);
  await page.waitForFunction(() => /larger than one resource may be|not the size/.test(document.querySelector('.char-status')?.textContent || ''));
  assert(await stored() === rawBeforeWrong, 'oversized file: the saved characters are byte-for-byte what they were before the picker');
  assert((await records()).length === recordsBeforeWrong, 'oversized file: the count is still ' + recordsBeforeWrong);
  await proposalOpen('oversized file');
  await pickFiles([{ name: 'tide-card.txt', mimeType: 'text/plain', buffer: Buffer.from(resources.card) }, { name: 'chart.png', mimeType: 'image/png', buffer: Buffer.from(resources.chart) }]);
  await review().waitFor();
  assert(/Came from a file you chose/.test(await page.locator('.char-resource[data-resource="asset:chart"]').innerText()), 'the review says these came from the files you chose');
  assert(await page.locator('.char-resource[data-resource="asset:chart"] img').evaluate((n) => n.complete && n.naturalWidth > 0), 'the chosen picture is shown');
  await save();
  recs = await records(); const ext = recs.find((r) => r.source.envelope.assets.some((a) => a.status === 'external'));
  assert(ext && byHash(ext)[sha(resources.card)] === b64(resources.card) && byHash(ext)[sha(resources.chart)] === b64(resources.chart), 'the exact external bytes were kept in the saved character');
  await page.reload(); await ready(); await openLibrary();
  await page.locator(`.char-item[data-individual="${ext.individualId}"] button:has-text("Details")`).click();
  await page.waitForSelector('.char-details img'); assert(await page.locator('.char-details .char-resource[data-resource="asset:card"] pre').textContent().then((t) => t.trimEnd()) === Buffer.from(resources.card).toString('utf8').trimEnd(), 'the external text survives a reload');
  await page.click('.app-dialog:has(.char-details) .dialog-actions .primary'); await closeDialog();
  ok('external Neri: chosen files are measured, matched by hash and kept; wrong files refuse; bytes survive reload');

  // 10. nothing was fetched and no model was asked
  assert(outside.length === 0, 'no request left the origin: ' + outside.join(', '));
  assert((await requestsToModel()).length === modelBefore, 'no request reached the model server');
  ok('no network or model side effects');

  // 11. a temporary chat keeps nothing: its own memory-only characters, none persisted, gone with the chat
  const beforeTemp = await stored();
  const dumpBeforeTemp = JSON.stringify(await dump());
  await page.click('button[aria-label="Temporary chat"], button[title="Temporary chat"]');
  await page.waitForFunction(() => document.body.classList.contains('view-temp'));
  await openInstructions(); await chooseFile('pip.bundle.json', bundles.minimal); await review().waitFor();
  assert(/Only for this temporary chat/.test(await review().innerText()), 'the review says this is for the temporary chat only');
  await save();
  await openLibrary();
  assert(await page.locator('.char-item').count() === 1 && /Only for this temporary chat/.test(await page.locator('.char-library').innerText()), 'the temporary library holds only the character made here');
  await closeDialog();
  assert(await stored() === beforeTemp, 'nothing reached storage');
  const countIn = (t, w) => t.split(w).length - 1; const dumpAfterTemp = JSON.stringify(await dump());
  assert(countIn(dumpAfterTemp, 'individual:') === countIn(dumpBeforeTemp, 'individual:') && countIn(dumpAfterTemp, 'cosmogenitor/bundle/0') === countIn(dumpBeforeTemp, 'cosmogenitor/bundle/0'), 'no local, session or database storage gained a character or a package for the temporary character');
  await page.click('button[aria-label="Leave temporary chat"], button[title="Leave temporary chat"]');
  await page.waitForFunction(() => !document.body.classList.contains('view-temp'));
  await openLibrary();
  assert(await page.locator('.char-item').count() === 6 && !/Only for this temporary chat/.test(await page.locator('.char-library').innerText()), 'back in a normal chat only the saved characters are listed');
  await closeDialog();
  await page.click('button[aria-label="Temporary chat"], button[title="Temporary chat"]'); await page.waitForFunction(() => document.body.classList.contains('view-temp'));
  await openLibrary();
  assert(await page.locator('.char-item').count() === 0, 'a new temporary chat starts empty: nothing is carried over');
  await closeDialog();
  await page.reload(); await ready();
  assert(await stored() === beforeTemp, 'a reload leaves the saved characters as they were');
  ok('temporary chat: memory only, separate per chat, never persisted, gone after leaving');

  // 12. the encrypted vault: save with it on, nothing readable at rest, lock, unlock, reload; a second tab is read-only
  const fingerprints = ['neri', 'bex', 'minimal'].map((n) => JSON.parse(bundles[n]).root);
  const plain = JSON.stringify(await dump());
  assert(fingerprints.every((f) => plain.includes(f)), 'before the vault the saved characters are in plain storage (control)');
  await openSettings('security'); await page.click('.set-row:has-text("App lock") button');
  await page.check('#lockEncrypt'); await page.fill('#lockNew1', 'correct horse'); await page.fill('#lockNew2', 'correct horse'); await page.click('.app-dialog button:has-text("Lock the app")');
  await page.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")', { timeout: 30000 }); await page.click('.app-dialog button:has-text("Remove it")');
  await page.waitForFunction((k) => !localStorage.getItem('chatThreads') && !localStorage.getItem(k), KEY, { timeout: 20000 }); await closeSettings();
  let d = await dump(); assert(!fingerprints.some((f) => JSON.stringify(d).includes(f)), 'with the vault on, no saved character is readable in local, session or database storage');
  await openLibrary(); assert(await page.locator('.char-item').count() === 6, 'the characters are all still there through the vault'); await closeDialog();
  await openInstructions(); await chooseFile('bex.again.json', bundles.bex); await review().waitFor(); await save();
  await page.waitForTimeout(1500);
  d = await dump(); assert(!JSON.stringify(d).includes(JSON.parse(bundles.bex).root) && !d.local[KEY], 'a character saved with the vault on is not readable at rest');
  await openSettings('security'); await page.click('.set-row:has-text("App lock") button'); await page.click('.app-dialog button:has-text("Lock now")');
  await page.waitForSelector('#lockScreen', { state: 'visible' }); assert(!(await page.content()).includes('Neri'), 'locked: no character is in the page');
  await unlock('correct horse'); await page.waitForSelector('#lockScreen', { state: 'hidden' }); await ready();
  await page.reload(); await page.waitForSelector('#lockScreen', { state: 'visible' }); await unlock('correct horse'); await page.waitForSelector('#lockScreen', { state: 'hidden' }); await ready();
  await openLibrary(); assert(await page.locator('.char-item').count() === 7, 'after unlock and reload all seven characters are back'); await closeDialog();
  const secondTab = await context.newPage(); await secondTab.goto(origin + '/');
  await secondTab.waitForSelector('#lockScreen', { state: 'visible' }); await secondTab.fill('#unlockPass', 'correct horse'); await secondTab.press('#unlockPass', 'Enter');
  await secondTab.waitForSelector('#lockScreen', { state: 'hidden' }); await ready(secondTab); await openInstructions(secondTab);
  await chooseFile('ro.json', bundles.minimal, secondTab); await review(secondTab).waitFor();
  await secondTab.waitForFunction(() => /open in another tab/.test(document.querySelector('.char-status')?.textContent || ''));
  assert(await secondTab.locator('.app-dialog .dialog-actions .primary').isDisabled(), 'a read-only vault tab cannot save');
  await secondTab.close();
  ok('vault: saved, unreadable at rest, lock/unlock/reload, read-only second tab refuses');

  assert(h.errors.length === 0, 'no page errors: ' + h.errors.join(' | '));
  console.log('characters e2e: ok');
} catch (e) { console.error(e); console.error(await page.locator('.app-dialog').innerText().catch(() => '')); process.exitCode = 1; }
finally { await h.close(); }
