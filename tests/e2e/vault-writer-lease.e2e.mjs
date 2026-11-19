// The vault writer lease in the whole app, in a real browser, through VISIBLE controls only (reads of storage and of navigator.locks are observations).
//   node scripts/e2e.mjs vault-writer-lease
// What it shows: (1) the person turns encryption on and the page really owns the writer lock; (2) Cancel on the visible "Turn it off" confirmation is no operation: the lock, the encrypted state and the
// stored text are exactly as they were; (3) the confirmed off gives the lock back (physical lock list is empty) and the plain copy is back; (4) a SECOND tab, with the first still open, turns encryption on
// through the visible controls and really owns the lock (its cleanup runs); (5) after that tab turns it off again, the FIRST tab can turn it on again and clean up (no invisible blocker).
// Browser/Web Locks/IndexedDB are real; PLC_E2E_PROFILE_ROOT names the profile folder, E2E_PORT_OFFSET moves the port (base 18597).
import { launch, assert } from './harness.mjs';
import { newProfileDir } from './profile-root.mjs';

const ok = (n) => console.log('PASS ' + n);
const h = await launch({ port: 18597, profileDir: newProfileDir('vault-writer-lease') });
const { context, origin } = h; const page = h.page;
const PASS = 'correct horse';
const ready = async (p) => { await p.waitForSelector('#messageInput'); await p.waitForFunction(() => window.__plcBooted === true && Boolean(window.plcShell), null, { timeout: 20000 }); await p.waitForFunction(() => !document.querySelector('#messageInput').disabled); };
const writerLocks = (p) => p.evaluate(async () => (await navigator.locks.query()).held.filter((x) => x.name === 'plc-vault-writer').length);
const rawThreads = (p) => p.evaluate(() => localStorage.getItem('chatThreads'));
const openSettings = async (p) => { if (!await p.locator('#settingsPage').isVisible()) { await p.click('button[aria-label="This device menu"]'); await p.click('.shell-pop-row:has-text("Settings")'); } await p.click('.settings-nav-item[data-section="security"]'); };
const closeSettings = async (p) => { if (await p.locator('#settingsPage').isVisible()) await p.click('button[aria-label="Close settings"]'); };
const turnOn = async (p) => {
  await openSettings(p); await p.click('.set-row:has-text("App lock") button');
  await p.check('#lockEncrypt'); await p.fill('#lockNew1', PASS); await p.fill('#lockNew2', PASS); await p.click('.app-dialog button:has-text("Lock the app")');
  await p.waitForSelector('.app-dialog:has-text("Remove the unencrypted copy")', { timeout: 30000 }); await p.click('.app-dialog button:has-text("Remove it")');
  await p.waitForFunction(() => !localStorage.getItem('chatThreads'), null, { timeout: 20000 }); await closeSettings(p);
};
const askOff = async (p) => { await openSettings(p); await p.click('.set-row:has-text("App lock") button'); await p.fill('#lockCurrent', PASS); await p.click('.app-dialog button:has-text("Turn encryption off")'); await p.waitForSelector('.app-dialog button:has-text("Turn it off")'); };
const confirmOff = async (p) => { await p.click('.app-dialog button:has-text("Turn it off")'); await p.waitForFunction(() => /Encryption is off/.test(document.body.innerText), null, { timeout: 30000 }); await closeSettings(p); };

try {
  await ready(page);
  await page.evaluate(() => localStorage.setItem('chatThreads', JSON.stringify([{ id: 'w1', title: 'Lease chat', messages: [{ role: 'user', content: 'lease-marker' }] }])));
  await page.reload(); await ready(page);
  assert(await writerLocks(page) === 0, 'a plain page holds no writer lock');
  const plainText = await rawThreads(page);

  await turnOn(page);
  assert(await writerLocks(page) === 1, '(1) after turning encryption on the page owns the real writer lock');
  ok('1. turning encryption on: the page owns the real writer lock');

  // (2) the visible Cancel
  await askOff(page); const beforeCancel = { locks: await writerLocks(page), raw: await rawThreads(page) };
  await page.click('.app-dialog button:has-text("Cancel")'); await page.waitForSelector('.app-dialog button:has-text("Turn it off")', { state: 'hidden' });
  const afterCancel = { locks: await writerLocks(page), raw: await rawThreads(page), off: /Encryption is off/.test(await page.evaluate(() => document.body.innerText)) };
  assert(beforeCancel.locks === 1 && afterCancel.locks === 1, '(2) Cancel keeps the owner lock: ' + JSON.stringify({ beforeCancel, afterCancel }));
  assert(afterCancel.raw === beforeCancel.raw && !afterCancel.off, '(2) Cancel changed nothing: ' + JSON.stringify(afterCancel));
  const other = await context.newPage(); await other.goto(origin + '/'); await other.waitForSelector('#lockScreen', { state: 'visible' }); await other.fill('#unlockPass', PASS); await other.press('#unlockPass', 'Enter'); await other.waitForSelector('#lockScreen', { state: 'hidden' }); await ready(other);
  assert(await writerLocks(other) === 1, '(2) a second tab sees the one owner lock and does not take it');
  await other.close();
  await page.locator('.app-dialog button[aria-label="Close"]').last().click();
  ok('2. visible Cancel on the Turn it off confirmation: no operation, the owner keeps the lock');

  // (3) the confirmed off
  await askOff(page); await confirmOff(page);
  assert(await writerLocks(page) === 0, '(3) after the confirmed off no writer lock is held');
  assert(await rawThreads(page) === plainText, '(3) the plain copy is back, byte for byte');
  ok('3. confirmed off: the lock is given back and the plain text is back');

  // (4) a second tab, with the first still open
  const second = await context.newPage(); await second.goto(origin + '/'); await ready(second);
  await turnOn(second);
  assert(await writerLocks(second) === 1, '(4) the second tab owns the real writer lock while the first stays open');
  assert(!page.isClosed(), 'first tab still open');
  ok('4. a second tab turns encryption on and owns the lock while the first tab is open');
  await askOff(second); await confirmOff(second);
  assert(await writerLocks(second) === 0, '(4) the second tab gives it back');

  // (5) the first tab again
  await turnOn(page);
  assert(await writerLocks(page) === 1, '(5) the first tab can turn it on again and owns the lock');
  ok('5. the first tab turns encryption on again after the second tab was done: no invisible blocker');
  await second.close();

  assert(h.errors.length === 0, 'no page errors: ' + h.errors.join(' | '));
  console.log('vault-writer-lease e2e: ok');
} catch (e) { console.error(e); console.error(await page.locator('.app-dialog').innerText().catch(() => '')); process.exitCode = 1; }
finally { await h.close(); }
