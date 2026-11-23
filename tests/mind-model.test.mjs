// The view-model of a conversation with a mind on this computer (chat/mind/mind-model.mjs): the five states of the status line and their sentences, the composer's reasons, the receipts, an unasked word,
// the occurrence identity of her words, where a host can be reached from, and the blocked-by-the-browser rule. Pure: no DOM, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { statusOf, receiptView, classifyReply, replyMessageId, replyToMessage, threadOccKeys, occKey, canReachLoopback, blockedByBrowser, handoffUrl, waitingLine, elapsedWords, COPY, RECEIPT_WORDS, markerOf } from '../chat/mind/mind-model.mjs';

const base = { name: 'Ada', address: 'http://127.0.0.1:9' };
const st = (availability, messages = [], extra = {}) => statusOf({ ...base, availability: { state: availability }, messages, ...extra });

test('available: the sentence, a polite status, the composer on', () => {
  const s = st('available');
  assert.equal(s.kind, 'available'); assert.equal(s.sentence, 'Connected to Ada on this computer.'); assert.equal(s.assertive, false); assert.equal(s.composerDisabled, false); assert.equal(s.reason, null);
});
test('unavailable, unreachable, unknown, not admitted: exact sentences, assertive, composer off with a reason, the right actions', () => {
  const un = st('unavailable');
  assert.equal(un.sentence, 'The host is not running, or its tab is closed. Nothing can be sent.'); assert.deepEqual(un.actions, ['Check again']);
  const ur = st('unreachable');
  assert.equal(ur.sentence, 'No answer from the host at http://127.0.0.1:9. Nothing was sent. It may be slow, or the address may be wrong.'); assert.deepEqual(ur.actions, ['Try again', 'Change address']);
  const uk = st('unreachable', [{ id: 'a', state: 'unknown' }]);
  assert.equal(uk.kind, 'unknown'); assert.equal(uk.sentence, 'Sent, but the host did not confirm. It may or may not have arrived. Send again only if you are happy to say it twice.'); assert.deepEqual(uk.actions, ['Check status']);
  const na = st('available', [{ id: 'a', state: 'refused', refusal: { class: 'not-admitted' }, at: 5 }]);
  assert.equal(na.kind, 'not-admitted'); assert.equal(na.sentence, 'The host does not know this participant id. Nothing was sent. Check the id, or ask whoever runs the host to admit you.');
  for (const s of [un, ur, uk, na]) { assert.equal(s.assertive, true); assert.equal(s.composerDisabled, true); assert.ok(s.reason && s.reason.length > 10); }
  assert.notEqual(new Set([un.shape, ur.shape, uk.shape, na.shape]).size, 1, 'each state has its own shape, not only a colour');
});
test('a refusal from before the connection was changed is the past', () => {
  const msgs = [{ id: 'a', state: 'refused', refusal: { class: 'not-admitted' }, at: 5 }];
  assert.equal(st('available', msgs, { ignoreRefusalsBefore: 6 }).kind, 'available');
  assert.equal(st('available', [...msgs, { id: 'b', state: 'accepted', at: 9 }]).kind, 'available', 'a later accepted message ends it');
});
test('before the first answer the line says it is checking and the composer is off', () => {
  for (const s of ['idle', 'connecting', undefined]) { const r = st(s); assert.equal(r.kind, 'checking'); assert.equal(r.composerDisabled, true); assert.equal(r.assertive, false); }
});
test('blocked: only an unreachable host the BROWSER refused; the sentence, Try again, nothing sent, composer off', () => {
  const b = st('unreachable', [], { blocked: true });
  assert.equal(b.kind, 'blocked'); assert.equal(b.sentence, "This browser cannot reach a mind on this computer from this page. Open the same page from the host's own address instead.");
  assert.deepEqual(b.actions, ['Try again']); assert.equal(b.composerDisabled, true); assert.match(b.detail, /Nothing was sent/); assert.equal(b.assertive, true);
  assert.equal(st('available', [], { blocked: true }).kind, 'available', 'blocked does not hide a host that answers');
  assert.equal(st('unavailable', [], { blocked: true }).kind, 'unavailable', 'a refusal is an answer, not a block');
});
test('blockedByBrowser: https page to http loopback is blocked; the plain http page, a host elsewhere, or no way to tell is not', () => {
  const a = 'http://127.0.0.1:7777';
  assert.equal(blockedByBrowser({ pageProtocol: 'https:', pageHostname: 'privatelocal.example', address: a }), true);
  assert.equal(blockedByBrowser({ pageProtocol: 'http:', pageHostname: '127.0.0.1', address: a }), false);
  assert.equal(blockedByBrowser({ pageProtocol: 'http:', pageHostname: 'localhost', address: a }), false);
  assert.equal(blockedByBrowser({ pageProtocol: 'https:', pageHostname: 'localhost', address: a }), false, 'the page itself is on this computer');
  assert.equal(blockedByBrowser({ pageProtocol: 'https:', pageHostname: 'privatelocal.example', address: 'https://host.example' }), false);
  assert.equal(blockedByBrowser({ pageProtocol: 'http:', pageHostname: 'x.example', address: 'http://host.example:1' }), false);
  assert.equal(blockedByBrowser({ pageProtocol: 'http:', pageHostname: '127.0.0.1', address: a, errorMessage: 'Permission was denied for this request to access the `loopback` address space.' }), true);
  assert.equal(blockedByBrowser({ address: 'nonsense' }), false);
});
test('receipts: the highest stage, the five-dot meter, the list, and loud only for a failure', () => {
  const none = receiptView({ state: 'sending', states: [] });
  assert.equal(none.highest, null); assert.equal(none.dots, 0); assert.equal(none.word, RECEIPT_WORDS.sending); assert.equal(none.loud, false);
  const some = receiptView({ state: 'delivered', states: ['accepted', 'delivered'], times: { accepted: 1 } });
  assert.equal(some.highest, 'delivered'); assert.equal(some.word, RECEIPT_WORDS.delivered); assert.equal(some.dots, 2); assert.equal(some.total, 5); assert.equal(some.loud, false);
  assert.deepEqual(some.list.map((x) => x.reached), [true, true, false, false, false]); assert.equal(some.list[0].at, 1);
  assert.equal(receiptView({ states: ['accepted', 'delivered', 'exposed', 'interpreted', 'persisted'] }).word, RECEIPT_WORDS.persisted);
  assert.equal(receiptView({ state: 'unknown', states: [] }).loud, true); assert.equal(receiptView({ state: 'refused', states: [] }).loud, true);
  assert.deepEqual(['unknown', 'refused', 'unavailable', 'accepted'].map(markerOf), ['unknown', 'refused', 'not-sent', null]);
  assert.deepEqual(Object.keys(RECEIPT_WORDS), ['sending', 'sent', 'accepted', 'delivered', 'exposed', 'interpreted', 'persisted']);
});
test('an unasked word is a reply none of whose causes is a message the person sent', () => {
  const sent = new Set(['m1', 'm2']);
  assert.equal(classifyReply({ causes: ['m2'] }, sent), 'reply');
  assert.equal(classifyReply({ causes: ['zzz'] }, sent), 'unasked');
  assert.equal(classifyReply({ causes: [] }, sent), 'unasked');
  assert.equal(classifyReply({}, ['m1']), 'unasked');
  assert.equal(classifyReply({ causes: ['zzz', 'm1'] }, ['m1']), 'reply');
});
test('one occurrence is one message id and one key, however often it comes; a different one is a different id', () => {
  const o = { source: 'host:x', id: 'r1' };
  assert.equal(replyMessageId(o), replyMessageId({ ...o, digest: 'whatever' }));
  assert.notEqual(replyMessageId(o), replyMessageId({ source: 'host:x', id: 'r2' }));
  assert.notEqual(replyMessageId(o), replyMessageId({ source: 'host:y', id: 'r1' }));
  const ids = new Set(Array.from({ length: 5000 }, (_, i) => replyMessageId({ source: 's', id: 'o' + i }))); assert.equal(ids.size, 5000);
  const m = replyToMessage({ occ: o, text: 'hi', causes: ['m1'], status: 'completed' }, { speaker: 'Ada', at: 7, unasked: true });
  assert.equal(m.role, 'assistant'); assert.equal(m.content, 'hi'); assert.equal(m.mind.unasked, true); assert.equal(m.id, replyMessageId(o));
  assert.deepEqual([...threadOccKeys({ messages: [m, { role: 'user', id: 'u' }] })], [occKey(o)]);
});
test('where a host can be reached from: a phone or a tablet cannot, a desktop with a touch screen can', () => {
  assert.equal(canReachLoopback({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' }), false);
  assert.equal(canReachLoopback({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36' }), false);
  assert.equal(canReachLoopback({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), false, 'an iPad that says it is a Mac');
  assert.equal(canReachLoopback({ userAgent: 'x', coarsePointer: true, finePointer: false, maxTouchPoints: 5 }), false);
  assert.equal(canReachLoopback({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', coarsePointer: false, finePointer: true, maxTouchPoints: 0 }), true);
  assert.equal(canReachLoopback({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', coarsePointer: true, finePointer: true, maxTouchPoints: 10 }), true, 'a laptop with a touch screen and a mouse');
  assert.equal(canReachLoopback({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0, finePointer: true }), true);
});
test('the waiting line appears only while a taken message has no word from her, with the elapsed time', () => {
  const t0 = 1000;
  const messages = [{ id: 'a', state: 'delivered', states: ['accepted', 'delivered'] }];
  const thread = [{ id: 'a', role: 'user', at: t0 }];
  assert.equal(waitingLine({ name: 'Ada', messages, threadMessages: thread, now: t0 + 125000 }), 'Waiting for Ada. No answer yet (2 min).');
  assert.equal(waitingLine({ name: 'Ada', messages, threadMessages: [...thread, { id: 'r', role: 'assistant', at: t0 + 5, mind: { causes: ['a'] } }], now: t0 + 9e5 }), null);
  assert.equal(waitingLine({ name: 'Ada', messages: [{ id: 'a', state: 'sending', states: [] }], threadMessages: thread, now: t0 + 9e5 }), null, 'a message the host has not taken is not waited for');
  assert.equal(elapsedWords(5000), 'under 1 min'); assert.equal(elapsedWords(3600000 + 120000), '1 h 2 min');
});
test('the handoff address: http(s) only, the route added once, nothing with credentials', () => {
  assert.equal(handoffUrl('http://127.0.0.1:5/'), 'http://127.0.0.1:5/message-handoff');
  assert.equal(handoffUrl('http://127.0.0.1:5/message-handoff'), 'http://127.0.0.1:5/message-handoff');
  for (const bad of ['', 'ftp://x', 'javascript:1', 'http://u:p@h', 'nope']) assert.equal(handoffUrl(bad), null, bad);
});
test('no sentence of this module is in her voice and none is a model', () => {
  for (const f of Object.values(COPY)) assert.equal(typeof f, 'function');
});
