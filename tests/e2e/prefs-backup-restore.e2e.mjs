// A protected backup carries the preferences it includes (standing instructions, Enter sends, voice, reading speed) and a fresh browser gets them back (T34).
// Everything through visible controls: set the preferences, Settings > Transfer chats and backups > Create protected backup (a real download), then Import chats or backup in separate
// FRESH persistent profiles (the passphrase dialog, the review dialog), then reload and use the Enter key.
//   source   Enter sends turned OFF in Memory & preferences (an explicit false); instructions typed there. Voice and speed have controls only when the browser offers voices
//            (headless Chromium offers none), so those two are written to the preferences key before the page starts when no control exists, and the test says which it did.
//   target 1 fresh: wrong passphrase first (storage byte-identical), then the right one. Enter sends is false, so Memory & preferences shows it off, Enter adds a new line and sends nothing,
//            before AND after a reload; instructions, voice and speed arrive; the person's other stored values stay.
//   target 2 a person who already chose here (Enter sends ON, own instructions, own speed): the backup changes none of those; it adds the voice they had not chosen.
//   node scripts/e2e.mjs prefs-backup-restore      (or: node tests/e2e/prefs-backup-restore.e2e.mjs)
// Profiles: PLC_E2E_PROFILE_ROOT (on this box a dedicated folder on /media/Vivarium); ports shift with E2E_PORT_OFFSET.
process.env.PLC_E2E_BRANCH ??= 'main'; // the production build, which is what people receive
const { launch, assert } = await import('./harness.mjs');
const { newProfileDir } = await import('./profile-root.mjs');
const { readFileSync, mkdtempSync, mkdirSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const ok = (n) => console.log('PASS ' + n);
const PASS = 'prefs-synthetic-passphrase-1', WRONG = 'prefs-wrong-passphrase-0';
const INSTR = 'Prefs standing instructions: answer in short sentences.';
mkdirSync(process.env.PLC_E2E_PROFILE_ROOT || tmpdir(), { recursive: true });
const downloads = mkdtempSync(join(process.env.PLC_E2E_PROFILE_ROOT || tmpdir(), 'prefs-downloads-'));

const ready = async (page) => { await page.waitForSelector('#messageInput'); await page.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 30000 }); await page.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const profileItem = async (page, l) => { await page.click('button[aria-label="This device menu"]'); await page.click(`.shell-pop-row:has-text("${l}")`); };
const closeDialogs = async (page) => { for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); } const c = page.locator('button[aria-label="Close settings"]'); if (await c.count() && await c.first().isVisible()) await c.first().click(); };
const openTransfer = async (page) => { await profileItem(page, 'Settings'); await page.waitForSelector('#settingsPage', { state: 'visible' }); await page.click('.settings-nav-item[data-section="data"]'); const t = page.locator('#settingsPage #transferChatsBtn'); await t.first().waitFor({ state: 'visible', timeout: 15000 }); await t.first().click(); await page.waitForSelector('#exportChatsBtn', { timeout: 15000 }); };
const chooseBackup = async (page, file) => { await closeDialogs(page); await openTransfer(page); const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), page.click('#importChatsBtn')]); await fc.setFiles(file); };
const prefsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plc.prefs.v1') || '{}'));
const rawLocal = (page) => page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !k.startsWith('plc.voice')).sort()));
// the composer hint line (#composerHint) is not drawn in the shell layout, so the visible proof of the setting is the Memory & preferences checkbox and the Enter key itself
const enterBoxChecked = async (page) => { await profileItem(page, 'Memory & preferences'); const v = await page.locator('.app-dialog label:has-text("Enter sends the message") input').isChecked(); await page.click('.app-dialog button:has-text("Done")'); return v; };
const enterIsNewline = async (page) => { // press Enter in the composer: with "Enter sends" off it must add a line and send nothing
  await page.fill('#messageInput', 'first line'); await page.press('#messageInput', 'Enter');
  return page.evaluate(() => ({ value: document.querySelector('#messageInput').value, sent: document.querySelectorAll('#messages .message, #messages [data-role]').length }));
};
const unlockAndImport = async (page, file, { pass = PASS } = {}) => {
  await chooseBackup(page, file);
  await page.waitForSelector('.app-dialog input', { timeout: 15000 }); await page.fill('.app-dialog input', pass); await page.click('.app-dialog button:has-text("Unlock backup")');
  await page.waitForSelector('.app-dialog button:has-text("Import")', { timeout: 20000 });
  await page.click('.app-dialog button:has-text("Import")'); await page.waitForSelector('.app-dialog', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(1500);
};

const sources = [];
let src, t1, t2, t3, t4;
try {
  // ---- source: explicit preferences, a protected backup ----
  src = await launch({ port: 18541, profileDir: newProfileDir('prefs-source'), storage: { 'plc.prefs.v1': JSON.stringify({ enterSends: null, voiceURI: 'seeded-voice-uri', speechRate: 1.4 }) } });
  let sp = src.page; await ready(sp);
  await profileItem(sp, 'Memory & preferences');
  await sp.fill('#prefInstructions', INSTR);
  const enterBox = sp.locator('.app-dialog label:has-text("Enter sends the message") input');
  const before = await enterBox.isChecked(); await enterBox.click(); const after = await enterBox.isChecked();
  assert(before === true && after === false, 'desktop default is Enter sends; the person turned it off: ' + before + ' -> ' + after);
  const voiceControls = await sp.locator('.app-dialog select[aria-label="Read-aloud voice"]').count();
  await sp.click('.app-dialog button:has-text("Done")');
  await sp.waitForFunction((t) => (JSON.parse(localStorage.getItem('plc.prefs.v1') || '{}').instructions === t), INSTR, { timeout: 15000 }); // saving is done under the preferences lock, so it completes a moment after the click
  const sPrefs = await prefsOf(sp);
  assert(sPrefs.enterSends === false && sPrefs.instructions === INSTR && sPrefs.voiceURI === 'seeded-voice-uri' && sPrefs.speechRate === 1.4, 'source preferences stored: ' + JSON.stringify(sPrefs));
  console.log('NOTE voice/speed controls in this browser: ' + (voiceControls ? 'present (not driven; values seeded)' : 'absent (headless offers no voices); voice and speed were seeded in the preferences key'));
  ok('source holds an explicit Enter sends = false with instructions, voice and speed');
  await openTransfer(sp);
  await sp.fill('#bkPass1', PASS); await sp.fill('#bkPass2', PASS);
  const [d] = await Promise.all([sp.waitForEvent('download', { timeout: 60000 }), sp.click('#createBackupBtn')]);
  const backupFile = join(downloads, 'backup.encrypted.json'); await d.saveAs(backupFile);
  const env = JSON.parse(readFileSync(backupFile, 'utf8'));
  assert(env.format === 'plc-encrypted-backup/1' && !/Prefs standing|seeded-voice/.test(readFileSync(backupFile, 'utf8')), 'the backup is an encrypted envelope with nothing readable');
  ok('protected backup downloaded through the visible control (plc-encrypted-backup/1, nothing readable)');
  await closeDialogs(sp);

  // ---- target 1: a fresh profile ----
  t1 = await launch({ port: 18542, build: false, profileDir: newProfileDir('prefs-target1') }); const p1 = t1.page; await ready(p1);
  assert(await enterBoxChecked(p1) === true, 'fresh desktop profile defaults to Enter sends');
  const untouched = await rawLocal(p1);
  await chooseBackup(p1, backupFile);
  await p1.waitForSelector('.app-dialog input', { timeout: 15000 }); await p1.fill('.app-dialog input', WRONG); await p1.click('.app-dialog button:has-text("Unlock backup")');
  await p1.waitForFunction(() => /That passphrase did not unlock the backup/.test(document.body.innerText), null, { timeout: 15000 });
  await p1.click('.app-dialog button:has-text("Cancel")'); await p1.waitForTimeout(600);
  assert(await rawLocal(p1) === untouched, 'a wrong passphrase left storage byte-identical');
  ok('wrong passphrase: storage byte-identical, preferences untouched');
  await unlockAndImport(p1, backupFile);
  const r1 = await prefsOf(p1);
  assert(r1.enterSends === false && r1.instructions === INSTR && r1.voiceURI === 'seeded-voice-uri' && r1.speechRate === 1.4, 'restored preferences: ' + JSON.stringify(r1));
  ok('fresh profile: enterSends=false (explicit, not null), instructions, voice and speed restored');
  await closeDialogs(p1);
  assert(await enterBoxChecked(p1) === false, 'Memory & preferences shows Enter sends OFF at once');
  let e = await enterIsNewline(p1); assert(e.value === 'first line\n' && e.sent === 0, 'Enter adds a new line and sends nothing right after the restore: ' + JSON.stringify(e));
  ok('after the restore: the setting shows Enter sends OFF; Enter adds a new line and sends nothing');
  await p1.reload(); await ready(p1);
  assert(await enterBoxChecked(p1) === false, 'after reload the setting still shows Enter sends OFF');
  e = await enterIsNewline(p1); assert(e.value === 'first line\n' && e.sent === 0, 'after reload Enter still adds a new line: ' + JSON.stringify(e));
  const reloaded = await prefsOf(p1); assert(reloaded.enterSends === false && reloaded.voiceURI === 'seeded-voice-uri' && reloaded.speechRate === 1.4 && reloaded.instructions === INSTR, 'after reload: ' + JSON.stringify(reloaded));
  ok('after reload: same setting, Enter still adds a new line, all four preferences still stored');

  // ---- target 2: the person already chose here ----
  t2 = await launch({ port: 18543, build: false, profileDir: newProfileDir('prefs-target2'), storage: { 'plc.prefs.v1': JSON.stringify({ enterSends: true, instructions: 'mine', speechRate: 0.8, callSounds: false, lastExportAt: 5 }) } }); const p2 = t2.page; await ready(p2);
  await unlockAndImport(p2, backupFile); await closeDialogs(p2);
  const r2 = await prefsOf(p2);
  assert(r2.enterSends === true && r2.instructions === 'mine' && r2.speechRate === 0.8 && r2.callSounds === false && r2.lastExportAt === 5, 'the person’s own choices were kept: ' + JSON.stringify(r2));
  assert(r2.voiceURI === 'seeded-voice-uri', 'the voice they had not chosen was taken: ' + JSON.stringify(r2));
  assert(await enterBoxChecked(p2) === true, 'their Enter sends = true still holds');
  ok('existing explicit choices kept (Enter sends on, instructions, speed, call sounds); only the unchosen voice was added');

  // ---- target 3: a browser without Web Locks: the restore is refused and writes NOTHING (no unlocked fallback) ----
  t3 = await launch({ port: 18544, build: false, profileDir: newProfileDir('prefs-target3'), storage: { 'plc.prefs.v1': JSON.stringify({ instructions: 'kept by refusal' }) }, init: () => { Object.defineProperty(Navigator.prototype, 'locks', { get() { return undefined; }, configurable: true }); } });
  const p3 = t3.page; await ready(p3);
  assert(await p3.evaluate(() => navigator.locks === undefined), 'the test browser really has no Web Locks');
  const before3 = await rawLocal(p3);
  await unlockAndImport(p3, backupFile); await closeDialogs(p3);
  const r3 = await prefsOf(p3);
  assert(JSON.stringify(r3) === JSON.stringify({ instructions: 'kept by refusal' }), 'nothing of the backup’s preferences was written without the lock: ' + JSON.stringify(r3));
  assert(await enterBoxChecked(p3) === true, 'the live Enter sends setting did not change either (desktop default stays ON)');
  assert(!(await rawLocal(p3)).includes('seeded-voice-uri'), 'the voice was not written');
  void before3;
  ok('no Web Locks: the restore of preferences is refused; stored preferences and the live Enter setting are unchanged');

  // ---- target 4: two tabs of one profile: a manual change in a stale tab does not erase the other tab's change, and a same-field stale change is reported ----
  t4 = await launch({ port: 18545, build: false, profileDir: newProfileDir('prefs-target4'), storage: { 'plc.prefs.v1': JSON.stringify({ enterSends: null }) } });
  const a4 = t4.page; await ready(a4);
  const b4 = await t4.context.newPage(); b4.on('pageerror', (e) => t4.errors.push(e.message)); await b4.goto(t4.origin + '/'); await ready(b4); // both tabs read the same (empty) preferences at start
  await profileItem(b4, 'Memory & preferences'); await b4.fill('#prefInstructions', 'written in tab B'); await b4.click('.app-dialog button:has-text("Done")'); await b4.waitForTimeout(500);
  assert((await prefsOf(b4)).instructions === 'written in tab B', 'tab B saved its instructions');
  await profileItem(a4, 'Memory & preferences'); // tab A is stale: it still believes there are no instructions
  await a4.locator('.app-dialog label:has-text("Enter sends the message") input').click(); // manual change of a DIFFERENT field
  await a4.click('.app-dialog button:has-text("Done")'); await a4.waitForTimeout(800);
  const m4 = await prefsOf(a4);
  assert(m4.enterSends === false && m4.instructions === 'written in tab B', 'both tabs’ changes survive: ' + JSON.stringify(m4));
  ok('two tabs: tab A’s manual Enter change did not erase tab B’s instructions (whole-object overwrite would have)');
  // same field: tab C and tab A both know the instructions as "written in tab B"; A saves a new text first, then C saves a different one
  const c4 = await t4.context.newPage(); c4.on('pageerror', (e) => t4.errors.push(e.message)); await c4.goto(t4.origin + '/'); await ready(c4);
  await profileItem(a4, 'Memory & preferences'); await a4.fill('#prefInstructions', 'text from tab A'); await a4.click('.app-dialog button:has-text("Done")'); await a4.waitForTimeout(600);
  assert((await prefsOf(a4)).instructions === 'text from tab A', 'tab A stored its edit');
  await profileItem(c4, 'Memory & preferences'); await c4.fill('#prefInstructions', 'text from stale tab C'); await c4.click('.app-dialog button:has-text("Done")');
  await c4.waitForFunction(() => /Another tab changed your standing instructions first/.test(document.body.innerText), null, { timeout: 15000 });
  const final4 = await prefsOf(c4);
  assert(final4.instructions === 'text from tab A' && final4.enterSends === false, 'the stale same-field edit was reported and did not overwrite: ' + JSON.stringify(final4));
  await profileItem(c4, 'Memory & preferences'); assert(await c4.inputValue('#prefInstructions') === 'text from tab A', 'tab C now shows the kept instructions'); await c4.click('.app-dialog button:has-text("Done")');
  ok('two tabs, same field: the first edit is kept, the stale one is reported in a toast and not written, nothing else lost');

  const errs = [...src.errors, ...t1.errors, ...t2.errors, ...t3.errors, ...t4.errors]; assert(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  ok('no page errors');
} finally {
  for (const h of [src, t1, t2, t3, t4]) { try { await h?.close(); } catch { /* already closed */ } }
}
void sources;
