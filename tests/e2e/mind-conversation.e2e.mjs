// A conversation with a mind on this computer (chat/mind/, docs/MIND-CONVERSATION.md), in a real browser against a SCRIPTED FAKE HOST (tests/helpers/mind-fake-host.mjs: the message handoff over HTTP,
// one route, NDJSON, CORS and CORP for the page). The suite drives the screen as a person does (visible controls only) and checks the sentences of the design, that the composer is off with a reason
// whenever she is not Available, that nothing appears in her lane that the host did not send, that a word is shown and stored once however often it is polled, and that deleting the chat
// leaves none of her words in storage. Port 18451 (this suite's own).
import { launch, assert } from './harness.mjs';
import { startFakeHost } from '../helpers/mind-fake-host.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 18451;
const ok = (m) => console.log('PASS', m);
const REACH = 'Reached on this computer only. Phones and other computers cannot reach it.';
const S = {
  available: 'Connected to Ada on this computer.',
  unavailable: 'The host is not running, or its tab is closed. Nothing can be sent.',
  unknown: 'Sent, but the host did not confirm. It may or may not have arrived. Send again only if you are happy to say it twice.',
  notAdmitted: 'The host does not know this participant id. Nothing was sent. Check the id, or ask whoever runs the host to admit you.'
};
const t = await launch({ port: PORT });
const { page, context } = t;
const host = await startFakeHost({ origin: t.origin, encounterOf: 'enc:e2e-1' });
const extras = [];   // pages and servers to close
const status = async (p = page) => (await p.locator('#mindStatus .mind-live-text').allInnerTexts()).join('').trim();
const waitStatus = (text, p = page, timeout = 15000) => p.waitForFunction((x) => [...document.querySelectorAll('#mindStatus .mind-live-text')].map((n) => n.textContent).join('').trim() === x, text, { timeout });
const waitUnreachable = (p = page, timeout = 20000) => p.waitForFunction(() => /^No answer from the host at /.test([...document.querySelectorAll('#mindStatus .mind-live-text')].map((n) => n.textContent).join('').trim()), null, { timeout });
const lane = async (cls, p = page) => p.locator(`#mindLog .mind-msg.${cls} .mind-text`).allInnerTexts();
const openSetupFromPlus = async (p = page) => { await p.click('#shellPlus'); await p.locator('.shell-pop-row', { hasText: 'Talk with a mind on this computer' }).click(); await p.waitForSelector('#mind-setup-address'); };
const fill = async (fields, p = page) => { for (const [k, v] of Object.entries(fields)) await p.fill('#mind-setup-' + k, String(v)); };
const sendText = async (text, p = page) => { await p.fill('#mindInput', text); await p.click('#mindSend'); };
const stored = (p = page) => p.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
const threadsOf = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('chatThreads') || '[]'));
const CONFIG = { name: 'Ada', address: host.address, resident: 'individual:fake-1', encounter: 'enc:e2e-1', participant: 'p:e2e-1', timeoutSeconds: 3 };
try {
  // ---- the entry, the setup dialog and its Check -----------------------------------------------------------------------------------------------------------------------------
  await page.waitForSelector('#shellPlus');
  await page.click('#shellPlus');
  const row = page.locator('.shell-pop-row', { hasText: 'Talk with a mind on this computer' });
  assert(await row.isVisible() && await row.isEnabled(), 'the entry is in the plus menu and can be opened here');
  await page.keyboard.press('Escape');
  await page.click('button[aria-label="Explore"]');
  assert(await page.locator('.shell-pop-row', { hasText: 'Talk with a mind on this computer' }).isVisible(), 'the entry is in Explore');
  await page.keyboard.press('Escape');
  ok('the entry is in the plus menu and in Explore');

  await openSetupFromPlus();
  assert(await page.locator('.app-dialog [role=dialog] h2, .app-dialog .sheet h2').first().innerText() === 'A mind on this computer', 'setup opens in the app dialog');
  await fill({ ...CONFIG, address: 'not an address' });
  await page.click('.app-dialog button:has-text("Check")');
  await page.waitForFunction(() => /not a web address/.test(document.getElementById('mindCheckAlert').textContent));
  await fill({ address: host.address });
  host.setMode('status-refuses-not-admitted');
  await page.click('.app-dialog button:has-text("Check")');
  await page.waitForFunction((x) => document.getElementById('mindCheckAlert').textContent === x, S.notAdmitted);
  assert((await page.locator('#mindCheckAlert').getAttribute('role')) === 'alert', 'a failure of the check is announced assertively');
  host.setMode('unavailable');
  await page.click('.app-dialog button:has-text("Check")');
  await page.waitForFunction((x) => document.getElementById('mindCheckAlert').textContent === x, S.unavailable);
  host.setMode('ok');
  const before = host.received.length;
  await page.click('.app-dialog button:has-text("Check")');
  await page.waitForFunction(() => /The host answered\./.test(document.getElementById('mindCheckResult').textContent));
  assert(host.received.length === before && host.log.every((f) => f?.kind === 'status-query'), 'the check sent no words: only status queries reached the host');
  await page.click('.app-dialog button:has-text("Open the conversation")');
  await page.waitForSelector('#mindScreen:not([hidden])');
  ok('setup: the check says what the host said, and sends nothing but a question');

  // ---- the thread ------------------------------------------------------------------------------------------------------------------------------------------------------------
  await waitStatus(S.available);
  assert(await page.locator('#mindScreen h1').innerText() === 'Ada', 'the name is the h1 of the screen');
  assert(await page.locator('#mindReach').innerText() === REACH, 'the fixed sub-line');
  assert(await page.locator('h1:not([aria-hidden="true"])').count() === 1, 'one h1 for assistive technology as well');
  assert(await page.locator('#mindStatus').isVisible() && await page.locator('#mindStatusPolite').getAttribute('aria-live') === 'polite', 'the status line is a polite live region');
  assert(!(await page.locator('#mindInput').isDisabled()), 'composer is on when she is available');
  assert(await page.locator('#messageForm').isHidden(), "the app's own composer (the model's) is not on this screen");
  assert(await page.locator('#mindLog .mind-msg').count() === 0, 'nothing in either lane before anyone says anything: no placeholder, no typing dots');
  ok('thread: one h1, the fixed sub-line, the status line, an empty log');

  // ---- accept, deliver, reply; her word is shown once however often it is polled ------------------------------------------------------------------------------------------------
  await sendText('ZEBRA-first question');
  await page.waitForSelector('#mindLog .mind-msg.person');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('#mindLog .mind-msg.person .mind-receipt-word')?.textContent || ''));
  assert(await page.locator('#mindLog .mind-msg.person .mind-meter i[data-on="1"]').count() === 5, 'five dots when all five receipts are in');
  await page.locator('#mindLog .mind-msg.person summary').click();
  assert(await page.locator('#mindLog .mind-msg.person .mind-receipt-list li[data-reached="1"]').count() === 5, 'the Receipts list shows all five reached, each with a time');
  const mid = host.lastMessageId();
  assert(await page.inputValue('#mindInput') === '', 'the draft is cleared once the message is kept');
  assert((await lane('mind')).length === 0, 'she has not spoken: her lane is empty (the host sent nothing)');
  host.say(mid, 'ZEBRA-reply from the host', { occId: 'occ-r1' });
  await page.waitForSelector('#mindLog .mind-msg.mind');
  await sleep(4500);   // several polls return the SAME occurrence
  assert(JSON.stringify(await lane('mind')) === JSON.stringify(['ZEBRA-reply from the host']), 'her word is shown once: ' + JSON.stringify(await lane('mind')));
  assert((await page.locator('#mindLog .mind-msg.mind .mind-label').innerText()) === 'Ada', 'her words carry her name as the label');
  const apiRequests = await (await fetch(`http://127.0.0.1:${t.api.port}/__requests`)).json();
  assert(apiRequests.filter((r) => /chat\/completions|responses|messages/.test(r.url)).length === 0, 'no model was called for any of this');
  ok('a message with five receipts, her reply once');

  // ---- storage: both sides are ordinary messages of the thread; a reload shows no word twice and keeps the thread ------------------------------------------------------------------
  let th = (await threadsOf()).find((x) => x.mind);
  assert(th && th.messages.length === 2 && th.messages[1].mind.occ.id === 'occ-r1' && th.messages[0].role === 'user', 'the thread holds both sides, hers with her occurrence key: ' + JSON.stringify(th?.messages?.map((m) => m.role)));
  await page.reload();
  await page.waitForSelector('#mindScreen:not([hidden])');
  await waitStatus(S.available);
  await sleep(3500);
  assert(JSON.stringify(await lane('mind')) === JSON.stringify(['ZEBRA-reply from the host']) && JSON.stringify(await lane('person')) === JSON.stringify(['ZEBRA-first question']), 'after a reload nothing is twice and nothing is lost');
  th = (await threadsOf()).find((x) => x.mind);
  assert(th.messages.length === 2, 'and the stored thread still has two messages, not more');
  ok('reload: the thread is kept and no word is shown or stored twice');

  // ---- an unasked word arrives while the person is writing ----------------------------------------------------------------------------------------------------------------------
  await page.focus('#mindInput');
  await page.keyboard.type('half a sent', { delay: 5 });
  const hostMessages = host.received.length;
  host.unasked('ZEBRA-unasked word', { occId: 'unasked-1' });
  await page.waitForSelector('#mindLog .mind-msg.unasked');
  assert(await page.evaluate(() => document.activeElement?.id) === 'mindInput', 'focus stays in the composer');
  assert(await page.inputValue('#mindInput') === 'half a sent', 'the draft is not altered');
  assert(/^Unprompted · Ada · \d{1,2}[:.]\d{2}/.test(await page.locator('#mindLog .mind-msg.unasked .mind-label').innerText()), 'the fixed label: ' + await page.locator('#mindLog .mind-msg.unasked .mind-label').innerText());
  assert((await page.locator('#mindAnnounce').innerText()) === 'Ada said something' && await page.locator('#mindAnnounce').getAttribute('aria-live') === 'polite', 'announced politely');
  await sleep(3200);
  assert(host.received.length === hostMessages, 'nothing was sent in answer: an unasked word is not answered automatically');
  assert((await lane('unasked')).length === 1, 'shown once');
  await page.fill('#mindInput', '');
  ok('an unasked word: own label and edge, announced politely, no focus stolen, no draft touched, nothing answers it');

  // ---- UNAVAILABLE: the host refuses; the composer is off with the reason ------------------------------------------------------------------------------------------------------
  host.setMode('unavailable');
  await waitStatus(S.unavailable);
  assert(await page.locator('#mindInput').isDisabled() && await page.locator('#mindSend').isDisabled(), 'composer is disabled, not hidden');
  assert(await page.locator('#mindInput').isVisible(), 'and still there');
  assert(/Nothing can be sent/.test(await page.locator('#mindReason').innerText()), 'with the reason written beside it: ' + await page.locator('#mindReason').innerText());
  assert(await page.locator('#mindStatusAssertive').getAttribute('role') === 'alert' && (await page.locator('#mindStatusAssertive').innerText()) === S.unavailable, 'a failure is in the assertive region');
  assert(await page.locator('#mindStatus button', { hasText: 'Check again' }).isVisible(), 'Check again');
  host.setMode('ok');
  await page.click('#mindStatus button:has-text("Check again")');
  await waitStatus(S.available);
  assert(!(await page.locator('#mindInput').isDisabled()), 'it re-enables when available again');
  ok('UNAVAILABLE: sentence, disabled composer with a reason, Check again');

  // ---- UNREACHABLE: no answer at all (the port is closed; then a host that never answers) ----------------------------------------------------------------------------------------------
  await host.stop();
  await waitUnreachable();
  assert((await status()) === `No answer from the host at ${host.address}. Nothing was sent. It may be slow, or the address may be wrong.`, 'unreachable sentence: ' + await status());
  assert(await page.locator('#mindInput').isDisabled(), 'composer off');
  assert(await page.locator('#mindStatus button', { hasText: 'Try again' }).isVisible() && await page.locator('#mindStatus button', { hasText: 'Change address' }).isVisible(), 'Try again and Change address');
  assert(!/failed|unavailable/i.test(await status()), 'unreachable is not called failed or unavailable');
  await host.start();
  await page.click('#mindStatus button:has-text("Try again")');
  await waitStatus(S.available);
  host.setMode('silent');
  await waitUnreachable(page, 25000);
  host.setMode('ok');
  await page.click('#mindStatus button:has-text("Try again")');
  await waitStatus(S.available);
  ok('UNREACHABLE: a closed port and a silent host both say no answer; Try again recovers');

  // ---- OUTCOME UNKNOWN: the host has the message, the answer never comes back -----------------------------------------------------------------------------------------------------
  host.setMode('blackhole-after-receive');
  await page.fill('#mindInput', 'ZEBRA-are you there');
  await page.click('#mindSend');
  await waitStatus(S.unknown, page, 30000);
  const unknownMsg = page.locator('#mindLog .mind-msg.person[data-marker="unknown"]');
  assert(await unknownMsg.count() === 1, 'a hatched marker is on THAT message');
  const unknownText = (await unknownMsg.innerText());
  assert(!/failed/i.test(unknownText) && !/\bSaved\b|\bDelivered\b/.test(unknownText), 'it is never called failed, and no receipt is claimed: ' + unknownText);
  assert(await page.locator('#mindInput').isDisabled(), 'composer is off while the outcome is unknown');
  assert(await page.locator('#mindStatus button', { hasText: 'Check status' }).isVisible(), 'Check status');
  await page.click('#mindStatus button:has-text("Check status")');
  await sleep(4500);
  assert((await status()) === S.unknown, 'with the host still silent, the answer is still unknown');
  host.setMode('ok');
  await page.waitForFunction(() => !document.querySelector('#mindLog .mind-msg[data-marker="unknown"]'), null, { timeout: 15000 }).catch(async () => { await page.click('#mindStatus button:has-text("Check status")'); });
  await waitStatus(S.available);
  assert(host.received.filter((m) => m.words === 'ZEBRA-are you there').length === 1, 'the host had it once: nothing was sent twice');
  ok('OUTCOME UNKNOWN: hatched marker on the message, Check status, resolves to known with no resend');

  // ---- NOT ADMITTED --------------------------------------------------------------------------------------------------------------------------------------------------------------
  host.setMode('not-admitted');
  await sendText('ZEBRA-let me in');
  await waitStatus(S.notAdmitted);
  assert(await page.locator('#mindInput').isDisabled(), 'composer off when not admitted');
  assert(await page.locator('#mindLog .mind-msg.person[data-marker="refused"]').count() === 1, 'the refused message says so');
  host.setMode('ok');
  await page.click('#mindStatus button:has-text("Change connection")');
  await page.waitForSelector('#mind-setup-address');
  assert(await page.inputValue('#mind-setup-participant') === 'p:e2e-1', 'the setup shows the saved connection');
  await page.fill('#mind-setup-participant', 'p:e2e-2');
  await page.click('.app-dialog button:has-text("Save")');
  await waitStatus(S.available);
  assert(!(await page.locator('#mindInput').isDisabled()), 'after the connection is changed she can be written to again');
  ok('NOT ADMITTED: sentence, refused marker, Change connection opens the setup, saving clears it');

  // ---- two tabs polling the same thread never duplicate a word ------------------------------------------------------------------------------------------------------------------------
  const second = await context.newPage(); extras.push(second);
  await second.goto(t.origin + '/');
  await second.waitForSelector('#mindScreen:not([hidden])', { timeout: 20000 });
  await waitStatus(S.available, second);
  const mid2 = host.lastMessageId();
  host.say(mid2, 'ZEBRA-two tabs word', { occId: 'occ-two' });
  await page.waitForFunction(() => [...document.querySelectorAll('#mindLog .mind-msg.mind .mind-text')].some((n) => n.textContent === 'ZEBRA-two tabs word'));
  await second.waitForFunction(() => [...document.querySelectorAll('#mindLog .mind-msg.mind .mind-text')].some((n) => n.textContent === 'ZEBRA-two tabs word'));
  await sleep(4000);
  const copies = (await threadsOf()).find((x) => x.mind).messages.filter((m) => m.mind?.occ?.id === 'occ-two').length;
  assert(copies === 1, 'the stored thread has the word once: ' + copies);
  assert((await lane('mind', page)).filter((x) => x === 'ZEBRA-two tabs word').length === 1 && (await lane('mind', second)).filter((x) => x === 'ZEBRA-two tabs word').length === 1, 'and each tab shows it once');
  await second.close();
  ok('two tabs: one stored word, one shown word each');

  // ---- nothing in her lane that the host did not send --------------------------------------------------------------------------------------------------------------------------------
  const sentByHost = new Set(['ZEBRA-reply from the host', 'ZEBRA-unasked word', 'ZEBRA-two tabs word']);
  const shown = [...(await lane('mind')), ...(await lane('unasked'))];
  assert(shown.every((x) => sentByHost.has(x)) && shown.length === 3, 'her lane holds only what the host sent: ' + JSON.stringify(shown));
  ok('nothing appears in her lane that the host did not send');

  // ---- deleting the chat leaves none of her words anywhere in storage -----------------------------------------------------------------------------------------------------------------
  const wordsOf = ['ZEBRA-reply from the host', 'ZEBRA-unasked word', 'ZEBRA-two tabs word', 'ZEBRA-first question', 'ZEBRA-are you there', 'ZEBRA-let me in'];
  const beforeStore = await stored();
  assert(wordsOf.filter((w) => beforeStore.includes(w)).length >= 3, 'control: the words are in storage while the chat exists');
  assert(/"plc\.mind\.v1"/.test(beforeStore), 'control: the bookkeeping key exists');
  const th0 = (await threadsOf()).find((x) => x.mind);
  await page.locator('#threadList li.selected .thread-menu-btn').click();
  await page.locator('.thread-menu button', { hasText: 'Delete' }).click();
  await page.waitForFunction(() => !document.querySelector('#mindScreen') || document.querySelector('#mindScreen').hidden);
  await page.click('button[aria-label="This device menu"]'); await page.click('.shell-pop-row:has-text("Settings")');
  await page.evaluate(() => window.plcShell.openSettings('data'));
  await page.click('.set-row:has-text("Recently deleted") button');
  await page.keyboard.press('Escape');
  await page.locator('#threadList li[data-id]').first().locator('.thread-menu-btn').click();
  await page.locator('.thread-menu button', { hasText: 'Delete permanently' }).click();
  await page.locator('.app-dialog button:has-text("Delete permanently")').click();
  await page.waitForFunction((id) => !JSON.parse(localStorage.getItem('chatThreads') || '[]').some((x) => x.id === id), th0.id);
  await sleep(1200);
  const afterStore = await stored();
  assert(wordsOf.every((w) => !afterStore.includes(w)), 'none of her words (or the person\'s) is left in storage: ' + wordsOf.filter((w) => afterStore.includes(w)));
  const mindKey = await page.evaluate(() => localStorage.getItem('plc.mind.v1'));
  assert(mindKey === null || !mindKey.includes(th0.id), 'the bookkeeping entry of the chat is gone with it');
  const dbs = await page.evaluate(async () => (await indexedDB.databases?.() || []).map((d) => d.name));
  assert(!dbs.some((n) => /mind/i.test(n)), 'no database of its own');
  ok('deleting the chat removes her words from every store');

  // ---- a phone: the entry is there, Open is off with the sentence, and the network is never tried ----------------------------------------------------------------------------------
  const phoneCtx = await t.browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  const phone = await phoneCtx.newPage(); extras.push(phone);
  await phone.addInitScript(() => localStorage.setItem('plc.lockSplash.v1', 'off'));
  const hostLog = host.log.length;
  await phone.goto(t.origin + '/');
  await phone.waitForSelector('#shellPlus');
  await phone.waitForFunction(() => Boolean(window.plcShell));
  await phone.click('#shellPlus');
  const prow = phone.locator('.shell-pop-row', { hasText: 'Talk with a mind on this computer' });
  assert(await prow.isVisible() && await prow.isDisabled(), 'on a phone the entry is shown and Open is disabled');
  assert((await prow.innerText()).includes(REACH), 'with the sentence: ' + await prow.innerText());
  assert(host.log.length === hostLog, 'and the host was never asked');
  assert((await prow.boundingBox()).height >= 44, 'a finger-sized target');
  await phoneCtx.close();
  ok('a phone: shown, disabled, with the sentence, nothing tried');

  // ---- the page on another origin than the one the host allows: exact-origin CORS, then the right origin ------------------------------------------------------------------------
  const other = `http://localhost:${PORT + Number(process.env.E2E_PORT_OFFSET || 0)}`;
  const strict = await startFakeHost({ origin: t.origin, encounterOf: 'enc:e2e-1' });
  const lenient = await startFakeHost({ origin: other, encounterOf: 'enc:e2e-1' });
  extras.push({ close: async () => { await strict.close(); await lenient.close(); } });
  const lp = await context.newPage(); extras.push(lp);
  await lp.goto(other + '/');
  await lp.waitForFunction(() => Boolean(window.plcShell), null, { timeout: 20000 });
  await openSetupFromPlus(lp);
  await fill({ ...CONFIG, address: strict.address }, lp);
  await lp.click('.app-dialog button:has-text("Check")');
  await lp.waitForFunction(() => /^No answer from the host at /.test(document.getElementById('mindCheckAlert').textContent), null, { timeout: 15000 });
  await fill({ address: lenient.address }, lp);
  await lp.click('.app-dialog button:has-text("Check")');
  await lp.waitForFunction(() => /The host answered\./.test(document.getElementById('mindCheckResult').textContent), null, { timeout: 15000 });
  await lp.click('.app-dialog button:has-text("Open the conversation")');
  await lp.waitForSelector('#mindScreen:not([hidden])');
  await waitStatus(S.available, lp);
  ok('another origin: a host that allows the exact origin is reached, one that allows another is not');
} finally {
  for (const p of extras) await p.close().catch(() => {});
  await host.close().catch(() => {});
  if (t.errors.length) console.log('page errors:', t.errors.join(' | '));
  await t.close();
}
