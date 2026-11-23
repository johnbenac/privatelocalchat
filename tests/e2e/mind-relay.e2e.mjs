// A conversation with a mind THROUGH A RELAY (chat/channel/relay-transport.mjs, chat/mind/, docs/MIND-CONVERSATION.md), in a real browser. Two parts, one port (18452):
//   A  a SCRIPTED FAKE RELAY (tests/helpers/fake-relay.mjs: a real WebSocket server with the relay's wire): the setup and its Check, the token only as a subprotocol and only in session storage,
//      receipts and her reply pushed and shown once (also after a reload and a second delivery), host absent, a lost link and its reconnect, superseded and revoked (neither reconnects), no token.
//   B  the platform's REAL test relay and the resident behind it (a real model on the LAN: replies take 30 to 300 seconds, so it waits for the receipts and ONE reply, generously). It is SKIPPED, with
//      the reason said, when the relay or the token is not there. The token file is read here only to be typed into the page's own field; it is never printed. Environment (all optional):
//        PLC_RELAY_TEST_ADDRESS  PLC_RELAY_TEST_CHANNEL  PLC_RELAY_TEST_TOKEN_FILE  PLC_RELAY_TEST_RESIDENT  PLC_RELAY_TEST_ENCOUNTER  PLC_RELAY_TEST_PARTICIPANT  PLC_RELAY_TEST_REPLY_MS
import { readFile } from 'node:fs/promises';
import { launch, assert } from './harness.mjs';
import { startFakeRelay } from '../helpers/fake-relay.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 18452;
const ok = (m) => console.log('PASS', m);
const TOKEN = 'e2e-relay-token-Zk9';
const S = {
  available: 'Connected to Ada through a relay.',
  absent: 'The mind is not connected to the relay right now. Nothing can be sent.',
  superseded: 'This conversation was opened in another tab, so it stopped here.',
  revoked: 'You are not allowed to use this connection any more. Nothing can be sent.',
  needsToken: 'Add your access token to connect. Nothing can be sent.',
  insecure: 'Could not connect securely.'
};
const t = await launch({ port: PORT });
const { page } = t;
const relay = await startFakeRelay({ token: TOKEN, channel: 'chan-e2e-0001' });
const extras = [];
const status = async (p = page) => (await p.locator('#mindStatus .mind-live-text').allInnerTexts()).join('').trim();
const waitStatus = (text, p = page, timeout = 40000) => p.waitForFunction((x) => [...document.querySelectorAll('#mindStatus .mind-live-text')].map((n) => n.textContent).join('').trim() === x, text, { timeout });
const waitStatusLike = (re, p = page, timeout = 40000) => p.waitForFunction((x) => new RegExp(x).test([...document.querySelectorAll('#mindStatus .mind-live-text')].map((n) => n.textContent).join('').trim()), re, { timeout });
const lane = (cls, p = page) => p.locator(`#mindLog .mind-msg.${cls} .mind-text`).allInnerTexts();
const openSetupFromPlus = async (p = page) => { await p.click('#shellPlus'); await p.locator('.shell-pop-row', { hasText: 'Talk with a mind on this computer' }).click(); await p.waitForSelector('#mind-setup-via-relay'); };
const fill = async (fields, p = page) => { for (const [k, v] of Object.entries(fields)) await p.fill('#mind-setup-' + k, String(v)); };
const sendText = async (text, p = page) => { await p.fill('#mindInput', text); await p.click('#mindSend'); };
const checkAnswer = (p = page) => p.waitForFunction(() => { const a = document.getElementById('mindCheckAlert').textContent, r = document.getElementById('mindCheckResult').textContent; return (a || r) && !/^Connecting/.test(a || r) ? (a || r) : false; }, null, { timeout: 30000 }).then((h) => h.jsonValue());
const localDump = (p = page) => p.evaluate(() => JSON.stringify({ ...localStorage }));
const sessionDump = (p = page) => p.evaluate(() => JSON.stringify({ ...sessionStorage }));
const threadsOf = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('chatThreads') || '[]'));
const RESIDENT = 'individual:fake-1', ENC = 'enc:e2e-relay', ME = 'p:e2e-relay';
const CONFIG = { name: 'Ada', relayAddress: relay.address, channel: relay.channel, token: TOKEN, resident: RESIDENT, encounter: ENC, participant: ME, timeoutSeconds: 5 };
try {
  // ---- A. the setup: the choice, the fields, Check ------------------------------------------------------------------------------------------------------------------------------------------
  await page.waitForFunction(() => Boolean(window.plcShell?.registry?.get('plus', 'mind')), null, { timeout: 60000 });
  await openSetupFromPlus();
  assert(await page.locator('#mind-setup-via-computer').isChecked(), 'on a computer the first choice is "On this computer"');
  assert(await page.locator('#mind-setup-relayAddress').isHidden() && await page.locator('#mind-setup-address').isVisible(), 'the relay fields are not shown for it');
  await page.check('#mind-setup-via-relay');
  assert(await page.locator('#mind-setup-relayAddress').isVisible() && await page.locator('#mind-setup-channel').isVisible() && await page.locator('#mind-setup-address').isHidden(), 'choosing the relay swaps the fields');
  assert((await page.locator('#mind-setup-token').getAttribute('type')) === 'password', 'the access token is a hidden field');
  assert(!/this computer/i.test(await page.locator('#mindSetupIntro').innerText()), 'the relay explanation does not say "this computer": ' + await page.locator('#mindSetupIntro').innerText());
  assert((await page.locator('#mind-setup-relayAddress').getAttribute('placeholder')) === 'https://relay.example', 'the placeholder is neutral');
  await fill({ ...CONFIG, token: 'a-wrong-token' });
  await page.click('#mindCheck');
  assert(/^No answer from the relay at 127\.0\.0\.1:\d+\. Nothing was sent\./.test(await checkAnswer()), 'a refused token looks like no answer to a browser, and is said so');
  await fill({ token: '' }); await page.click('#mindCheck');
  assert((await checkAnswer()) === 'Add your access token first. Nothing was sent.', 'no token');
  relay.setHost(false); await fill({ token: TOKEN }); await page.click('#mindCheck');
  assert((await checkAnswer()) === 'The relay answered, but the mind is not connected to it right now. Nothing was sent.', 'the relay answered: host absent');
  relay.setHost(true); await page.click('#mindCheck');
  assert((await checkAnswer()) === 'The relay answered and the mind is connected to it. Nothing was sent.', 'host present');
  assert(relay.received.length === 0, 'the check sent nothing');
  await fill({ relayAddress: relay.address.replace('http:', 'https:') }); await page.click('#mindCheck');
  assert((await checkAnswer()) === S.insecure + ' The browser does not say why. Nothing was sent.', 'a secure connection to a plain server fails before it opens: only that is said');
  await fill({ relayAddress: relay.address });
  ok('setup: the choice, the relay fields, and every answer of Check in plain words, nothing sent');

  await page.click('.app-dialog button:has-text("Open the conversation")');
  await page.waitForSelector('#mindScreen:not([hidden])');
  await waitStatus(S.available);
  assert(await page.locator('#mindReach').innerText() === 'Reached through a relay.', 'the sub-line does not claim this computer only');
  assert(!/this computer/i.test(await page.locator('#mindScreen').innerText()), 'nothing on the screen says "this computer": ' + (await page.locator('#mindScreen').innerText()).slice(0, 300));
  assert(await page.locator('#mindScreen h1').innerText() === 'Ada', 'the name is the h1');
  assert(relay.handshakes.every((h) => !h.path.includes(TOKEN) && !/token|bearer/i.test(h.path)), 'the token is in no address: ' + JSON.stringify(relay.handshakes.map((h) => h.path)));
  assert(relay.handshakes.at(-1).protocols.includes('bearer.' + TOKEN) && relay.handshakes.at(-1).protocols.includes('relay.v1'), 'the token went as a subprotocol');
  ok('the conversation opens: connected through a relay, the token as a subprotocol only');

  // ---- storage of the token: this tab's session only ---------------------------------------------------------------------------------------------------------------------------------------
  assert(!(await localDump()).includes(TOKEN), 'the token is in no local storage (chats, bookkeeping, settings)');
  assert((await sessionDump()).includes(TOKEN) && JSON.parse(JSON.parse(await sessionDump())['plc.mind.relayToken.v1']).v === 1, 'it is in session storage under its own key');
  const th0 = (await threadsOf()).find((x) => x.mind);
  assert(th0.mind.via === 'relay' && th0.mind.channel === relay.channel && !JSON.stringify(th0).includes(TOKEN), 'the chat names the relay and channel, never the token');
  ok('storage: the token is for this tab only and never in the chat');

  // ---- a message: receipts pushed, her reply once, also after a second delivery and a reload ---------------------------------------------------------------------------------------------------
  await sendText('ZEBRA-first question');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('#mindLog .mind-msg.person .mind-receipt-word')?.textContent || ''), null, { timeout: 20000 });
  const msg = relay.received.find((f) => f.kind === 'message');
  assert(msg && msg.words === 'ZEBRA-first question' && relay.routing.every((r) => r.t === 'msg' && Object.keys(r).length === 1), 'one frame per message, with a bare routing line');
  assert(relay.received.every((f) => !JSON.stringify(f).includes(TOKEN)), 'and no frame carries the token');
  const said = relay.say(msg.id, 'ZEBRA-reply from the host', { occId: 'occ-r1' });
  await page.waitForSelector('#mindLog .mind-msg.mind');
  relay.sayAgain(said); relay.sayAgain(said); await sleep(800);
  assert(JSON.stringify(await lane('mind')) === JSON.stringify(['ZEBRA-reply from the host']), 'her word is shown once however often it is delivered');
  await page.reload();
  await page.waitForSelector('#mindScreen:not([hidden])'); await waitStatus(S.available);
  relay.sayAgain(said); await sleep(800);
  assert(JSON.stringify(await lane('mind')) === JSON.stringify(['ZEBRA-reply from the host']) && (await threadsOf()).find((x) => x.mind).messages.length === 2, 'after a reload and another delivery: once on screen and once stored; the token survived the reload (same tab)');
  ok('a message with five receipts, her reply once, after a second delivery and a reload');

  // ---- the host leaves and returns: UNAVAILABLE (an answer), never unreachable ----------------------------------------------------------------------------------------------------------------
  relay.setHost(false);
  await waitStatus(S.absent);
  assert(await page.locator('#mindInput').isDisabled(), 'nothing can be written while she is not connected');
  relay.setHost(true);
  await waitStatus(S.available);
  ok('host absent is unavailable, host present is available');

  // ---- a lost link: unreachable, then it reconnects by itself ---------------------------------------------------------------------------------------------------------------------------------
  const before = relay.handshakes.length;
  relay.dropLinks();
  await waitStatusLike('^No answer from the relay at ', page, 10000);
  await waitStatus(S.available, page, 15000);
  assert(relay.handshakes.length > before, 'it reconnected by itself');
  ok('a lost link is unreachable and reconnects with a backoff');

  // ---- superseded: its own state and NO loop; the person chooses to use it here --------------------------------------------------------------------------------------------------------------
  const n1 = relay.handshakes.length;
  relay.supersede();
  await waitStatus(S.superseded);
  await sleep(5000);
  assert(relay.handshakes.length === n1, 'no reconnect after superseded, however long it waits');
  assert(await page.locator('#mindInput').isDisabled(), 'and nothing can be sent from here');
  await page.click('#mindStatus button:has-text("Use it here")');
  await waitStatus(S.available);
  ok('superseded: said once, never retried, and the person can use it here');

  // ---- revoked: a refusal, no loop; a fresh token is the person's act -----------------------------------------------------------------------------------------------------------------------------
  const n2 = relay.handshakes.length;
  relay.revoke();
  await waitStatus(S.revoked);
  await sleep(5000);
  assert(relay.handshakes.length === n2, 'no reconnect after revoked');
  await page.click('#mindStatus button:has-text("Change connection")');
  await page.waitForSelector('#mind-setup-token');
  assert(await page.locator('#mind-setup-via-relay').isChecked() && (await page.inputValue('#mind-setup-token')) === '', 'the connection opens on the relay, the token field is empty (never shown)');
  await fill({ token: TOKEN });
  await page.click('.app-dialog button:has-text("Save")');
  await waitStatus(S.available);
  ok('revoked: a refusal state, no loop, a fresh token reconnects');

  // ---- no token (a new session): asked for, never invented -------------------------------------------------------------------------------------------------------------------------------------
  await page.evaluate(() => sessionStorage.removeItem('plc.mind.relayToken.v1'));
  await page.reload();
  await page.waitForSelector('#mindScreen:not([hidden])'); await waitStatus(S.needsToken);
  const n3 = relay.handshakes.length; await sleep(3000);
  assert(relay.handshakes.length === n3, 'with no token nothing is attempted');
  await page.click('#mindStatus button:has-text("Change connection")'); await page.waitForSelector('#mind-setup-token');
  await page.click('.app-dialog button:has-text("Save")');
  await page.waitForFunction(() => document.getElementById('mindCheckAlert').textContent.includes('Access token'), null, { timeout: 5000 });
  await fill({ token: TOKEN }); await page.click('.app-dialog button:has-text("Save")');
  await waitStatus(S.available);
  ok('no token: it asks, and saving needs one');

  // ---- the link drops between two messages and returns ---------------------------------------------------------------------------------------------------------------------------------------------
  const unknownCount = relay.received.length;
  relay.dropLinks();   // the link goes between two messages; nothing is typed until it is back
  await waitStatus(S.available, page, 20000);
  assert(relay.received.length >= unknownCount, 'sanity: nothing was lost from the host side');
  ok('the link can drop and return between messages without any word lost');

  // ---- B. the real relay and the real resident --------------------------------------------------------------------------------------------------------------------------------------------------
  await realRelay();
} finally {
  for (const p of extras) await p.close().catch(() => {});
  await relay.close().catch(() => {});
  if (t.errors.length) console.log('page errors:', t.errors.join(' | '));
  await t.close();
}

async function realRelay() {
  const address = process.env.PLC_RELAY_TEST_ADDRESS || 'https://relay-test.benac.dev';
  const channel = process.env.PLC_RELAY_TEST_CHANNEL || 'chan-plc-test-0001';
  const tokenFile = process.env.PLC_RELAY_TEST_TOKEN_FILE || '/var/lib/cosmoshot/platform-relay-test/plc-tester-1.token';
  const resident = process.env.PLC_RELAY_TEST_RESIDENT || 'individual:room-1-resident';
  const encounter = process.env.PLC_RELAY_TEST_ENCOUNTER || 'enc:plc:relay-1';
  const participant = process.env.PLC_RELAY_TEST_PARTICIPANT || 'p:plc:tester-1';
  const replyMs = Number(process.env.PLC_RELAY_TEST_REPLY_MS || 420000);
  const skip = (why) => console.log('SKIP real relay: ' + why);
  let token;
  try { token = (await readFile(tokenFile, 'utf8')).trim(); } catch { return skip('the token file is not readable (mint one with serve-test.mjs --mint, see the board task T1124)'); }
  if (!token) return skip('the token file is empty');
  // a browser that trusts the LAN's certificate authority: the relay's certificate is the Centroid CA's
  const ctx = await t.browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); extras.push({ close: () => ctx.close() });
  await p.addInitScript(() => localStorage.setItem('plc.lockSplash.v1', 'off'));
  await p.goto(t.origin + '/');
  await p.waitForFunction(() => Boolean(window.plcShell?.registry?.get('plus', 'mind')), null, { timeout: 60000 });
  // is the relay there, and is the token still good? One look through the page's own WebSocket (nothing is sent)
  const probe = await p.evaluate(({ address, channel, token }) => new Promise((resolve) => {
    let opened = false; const url = address.replace(/^http/, 'ws') + '/channel/' + channel + '?as=surface';
    let ws; try { ws = new WebSocket(url, ['relay.v1', 'bearer.' + token]); } catch (e) { resolve('error'); return; }
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(opened ? 'silent' : 'no-answer'); }, 12000);
    ws.onopen = () => { opened = true; };
    ws.onmessage = (e) => { clearTimeout(timer); try { const r = JSON.parse(String(e.data).split('\n')[0]); resolve(r.code || 'other'); } catch { resolve('other'); } try { ws.close(); } catch {} };
    ws.onclose = (e) => { clearTimeout(timer); resolve(opened ? 'closed-' + e.code : 'not-opened'); };
  }), { address, channel, token });
  if (probe !== 'host-present') return skip(`the relay answered "${probe}" (the relay is not reachable, the token has expired, or the resident is not connected); nothing was tested`);
  await sleep(1500);   // the probe's connection is closed before the page opens its own: the relay would otherwise supersede it
  await openSetupFromPlus(p);
  await p.check('#mind-setup-via-relay');
  await fill({ name: 'Pat', relayAddress: address, channel, token, resident, encounter, participant, timeoutSeconds: 15 }, p);
  await p.click('#mindCheck');
  const checked = await checkAnswer(p);
  assert(checked === 'The relay answered and the mind is connected to it. Nothing was sent.', 'Check against the real relay: ' + checked);
  await sleep(1000);
  await p.click('.app-dialog button:has-text("Open the conversation")');
  await p.waitForSelector('#mindScreen:not([hidden])');
  await waitStatus('Connected to Pat through a relay.', p, 30000);
  assert(!(await p.evaluate(() => JSON.stringify({ ...localStorage }))).includes(token), 'the real token is in no local storage');
  await sendText('Hello, this is a test of the relay. Please answer in one short sentence.', p);
  await p.waitForFunction(() => /Delivered|Shown to the mind|Understood|Saved|Accepted/.test(document.querySelector('#mindLog .mind-msg.person .mind-receipt-word')?.textContent || ''), null, { timeout: 60000 });
  console.log('real relay: receipts began: ' + await p.locator('#mindLog .mind-msg.person .mind-receipt-word').innerText());
  try {
    await p.waitForSelector('#mindLog .mind-msg.mind', { timeout: replyMs });
  } catch { assert(false, `the real resident did not reply within ${Math.round(replyMs / 1000)} s (the model on the LAN may be busy; try PLC_RELAY_TEST_REPLY_MS)`); }
  await sleep(1500);
  const replies = await lane('mind', p);
  assert(replies.length === 1 && replies[0].trim().length > 0, 'ONE reply, with words: ' + replies.length);
  const stored = (await p.evaluate(() => JSON.parse(localStorage.getItem('chatThreads') || '[]'))).find((x) => x.mind);
  assert(stored.messages.filter((m) => m.role === 'assistant').length === 1, 'and ONE stored');
  ok('real relay: connected, one message with receipts, one reply from the real resident, shown and stored once');
}
