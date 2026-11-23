// SPDX-License-Identifier: AGPL-3.0-only
// The channel client's relay transport (chat/channel/relay-transport.mjs) against a scripted WebSocket (tests/helpers/fake-websocket.mjs): the test plays the relay.
// What it pins: the wire (one routing line and ONE contract frame per message, the token a subprotocol and never in the address), the honest states (host-absent and refused:no-host are UNAVAILABLE,
// silence and a lost link UNREACHABLE, a failure before opening on a secure address says only that it could not connect securely), the two endings that are never retried (superseded 4000,
// revoked 4001), the backoff (1.5 s doubling to 15 s, reset by a message), a reply shown once by id and by occurrence across a reconnect, the 1 MiB limit, a hidden tab, and the channel client on top.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayTransport, relayUrl, checkRelay, SUBPROTOCOL, MAX_FRAME_BYTES } from '../chat/channel/relay-transport.mjs';
import { createChannelClient } from '../chat/channel/client.mjs';
import { statusOf } from '../chat/mind/mind-model.mjs';
import { createFakeWebSocket, createFakeTimers } from './helpers/fake-websocket.mjs';

const URL_OK = 'wss://relay.example/channel/chan-test-0001?as=surface';
const TOKEN = 'tok-secret-value';
const reply = (id, text, occId = id, replyId = 'reply-' + id) => ({ kind: 'reply', id: replyId, encounter: 'enc:test', occ: { source: 'host:test', id: occId, digest: 'd-' + occId }, delivered: text, status: 'completed', causes: ['m1'] });

function rig({ token = TOKEN, doc = undefined, url = URL_OK, ...rest } = {}) {
  const WebSocket = createFakeWebSocket(), timers = createFakeTimers();
  const log = { frames: [], closes: [], records: [] };
  const holder = { token };
  const transport = createRelayTransport({ url, getToken: () => holder.token, WebSocket, timers, doc: doc ?? null, now: timers.now, ...rest });
  const sub = transport.subscribe({ after: 0 }, (f, seq) => log.frames.push({ f, seq }), (r) => log.closes.push(r), (f) => log.records.push(f));
  return { WebSocket, timers, log, transport, sub, holder, sock: () => WebSocket.last() };
}

test('relayUrl: the secure scheme always, a plain one only on this computer, never a token, a login or a query', () => {
  assert.equal(relayUrl({ address: 'https://relay.example', channel: 'chan-test-0001' }), URL_OK);
  assert.equal(relayUrl({ address: 'wss://relay.example/', channel: 'chan-test-0001' }), URL_OK);
  assert.equal(relayUrl({ address: 'https://relay.example/base/', channel: 'chan-test-0001' }), 'wss://relay.example/base/channel/chan-test-0001?as=surface');
  assert.equal(relayUrl({ address: 'http://127.0.0.1:8791', channel: 'chan-test-0001' }), 'ws://127.0.0.1:8791/channel/chan-test-0001?as=surface');
  assert.equal(relayUrl({ address: 'http://relay.example', channel: 'chan-test-0001' }), null, 'a plain scheme to another computer is refused');
  assert.equal(relayUrl({ address: 'https://user:pw@relay.example', channel: 'chan-test-0001' }), null);
  assert.equal(relayUrl({ address: 'https://relay.example/?token=abc', channel: 'chan-test-0001' }), null);
  assert.equal(relayUrl({ address: 'https://relay.example', channel: 'short' }), null);
  assert.equal(relayUrl({ address: 'https://relay.example', channel: 'bad channel!!' }), null);
  assert.equal(relayUrl({ address: 'file:///x', channel: 'chan-test-0001' }), null);
  assert.throws(() => createRelayTransport({ url: URL_OK + '&token=abc', getToken: () => 'x', WebSocket: createFakeWebSocket() }), /never part of the address/);
});

test('the token is a subprotocol and appears nowhere else: not in the address, not in a frame', async () => {
  const r = rig();
  const sock = r.sock(); sock.open().ctl('host-present');
  assert.deepEqual(sock.protocols, [SUBPROTOCOL, 'bearer.' + TOKEN]);
  assert.ok(!sock.url.includes(TOKEN) && !/token|bearer/i.test(sock.url));
  const answer = r.transport.request({ kind: 'message', id: 'm1', words: 'hello' });
  sock.frame({ kind: 'receipt', state: 'accepted', messageId: 'm1' });
  await answer;
  assert.ok(sock.sent.every((t) => !t.includes(TOKEN)), 'no frame carries the token');
});

test('one contract frame per message: a routing line, a newline, the frame; the answer is the first receipt, the rest are passed on', async () => {
  const r = rig(); const sock = r.sock(); sock.open().ctl('host-present');
  const pending = r.transport.request({ kind: 'message', id: 'm1', words: 'hello\nworld' });
  assert.equal(sock.sent.length, 1);
  const text = sock.sent[0];
  assert.equal(text.split('\n')[0], '{"t":"msg"}');
  assert.deepEqual(JSON.parse(text.slice(text.indexOf('\n') + 1)), { kind: 'message', id: 'm1', words: 'hello\nworld' }, 'the frame is the body, byte for byte as JSON, newlines of the words escaped');
  sock.frame({ kind: 'receipt', state: 'accepted', messageId: 'm1' });
  assert.deepEqual(await pending, [{ kind: 'receipt', state: 'accepted', messageId: 'm1' }]);
  sock.frame({ kind: 'receipt', state: 'delivered', messageId: 'm1', worldSeq: 4 });
  assert.deepEqual(r.log.records.filter((x) => x.kind === 'receipt'), [{ kind: 'receipt', state: 'delivered', messageId: 'm1', worldSeq: 4 }], 'a later receipt is pushed, never lost');
});

test('a status query is answered by its status; a reply pushed meanwhile still comes out once through onFrame', async () => {
  const r = rig(); const sock = r.sock(); sock.open().ctl('host-present');
  const pending = r.transport.request({ kind: 'status-query', messageId: 'm1' });
  sock.frame(reply('a', 'one')); sock.frame({ kind: 'status', messageId: 'm1', known: true, states: ['accepted'] });
  assert.equal((await pending)[0].kind, 'status');
  assert.equal(r.log.frames.length, 1); assert.equal(r.log.frames[0].f.delivered, 'one'); assert.equal(r.log.frames[0].seq, 1);
});

test('host-absent is UNAVAILABLE: a refusal the relay answered, passed on at once; refused:no-host answers the message as a refusal', async () => {
  const r = rig(); const sock = r.sock(); sock.open().ctl('host-absent');
  assert.equal(r.log.records.at(-1).class, 'unavailable'); assert.equal(r.log.records.at(-1).reason, 'host-absent');
  const pending = r.transport.request({ kind: 'message', id: 'm1', words: 'hi' });
  sock.ctl('refused', { reason: 'no-host', for: 'msg' });
  assert.deepEqual(await pending, [{ kind: 'refusal', class: 'unavailable', messageId: 'm1', reason: 'no-host' }]);
  assert.deepEqual(r.log.closes, [], 'a refusal is an answer: nothing was reported as a silence');
  const queue = r.transport.request({ kind: 'message', id: 'm2', words: 'hi' });
  sock.ctl('refused', { reason: 'queue-full', for: 'msg' });
  assert.equal((await queue)[0].reason, 'queue-full');
  sock.ctl('host-present');
  assert.deepEqual(r.log.records.at(-1), { kind: 'presence', present: true });
});

test('a lost link is UNREACHABLE and reconnects: 1.5 s doubling to 15 s, reset by any message', () => {
  const r = rig(); let sock = r.sock(); sock.open().ctl('host-present');
  const waits = [];
  for (let i = 0; i < 6; i += 1) {
    const wait = r.transport.state().backoffMs; waits.push(wait);   // the wait about to be armed (it doubles once armed)
    sock.shut(1006);
    const before = r.WebSocket.all.length;
    r.timers.tick(1); assert.equal(r.WebSocket.all.length, before, 'not yet reconnected');
    r.timers.tick(15000); assert.equal(r.WebSocket.all.length, before + 1, 'reconnected after its wait');
    sock = r.sock(); sock.open();
  }
  assert.deepEqual(waits, [1500, 3000, 6000, 12000, 15000, 15000]);
  assert.ok(r.log.closes.every((x) => x === 'unreachable'));
  sock.ctl('host-present');   // any message resets the wait
  assert.equal(r.transport.state().backoffMs, 1500);
});

test('the wait is exactly the backoff: not earlier, and the next one doubles', () => {
  const r = rig(); const first = r.sock(); first.open().ctl('host-present'); first.shut(1006);
  r.timers.tick(1499); assert.equal(r.WebSocket.all.length, 1);
  r.timers.tick(1); assert.equal(r.WebSocket.all.length, 2);
  r.sock().fail();   // never opened
  r.timers.tick(2999); assert.equal(r.WebSocket.all.length, 2);
  r.timers.tick(1); assert.equal(r.WebSocket.all.length, 3);
});

test('a failure before opening on a secure address says only that it could not connect securely; a silence is unreachable; a plain address says unreachable', () => {
  const r = rig(); r.sock().fail();
  assert.deepEqual(r.log.closes, ['insecure']);
  const s = rig({ connectTimeoutMs: 5000 }); s.timers.tick(5000);
  assert.deepEqual(s.log.closes, ['unreachable'], 'no answer at all');
  assert.equal(s.sock().readyState, 3, 'the silent attempt was abandoned');
  const plain = rig({ url: 'ws://127.0.0.1:8791/channel/chan-test-0001?as=surface' }); plain.sock().fail();
  assert.deepEqual(plain.log.closes, ['unreachable']);
});

test('superseded (4000): its own state, and NEVER reconnected in a loop', () => {
  const r = rig(); const sock = r.sock(); sock.open().ctl('host-present');
  sock.shut(4000);
  assert.deepEqual(r.log.closes, ['superseded']);
  r.timers.tick(600000);
  assert.equal(r.WebSocket.all.length, 1, 'no second connection, however long it waits');
  assert.equal(r.timers.pending(), 0, 'and nothing is armed to make one');
  r.transport.nudge(); assert.equal(r.WebSocket.all.length, 1, 'not even when asked to look again (the tab shown)');
  assert.equal(r.transport.state().terminal, 'superseded');
  // the person's own act: subscribe again
  r.transport.subscribe({}, () => {}, (x) => r.log.closes.push(x), () => {});
  assert.equal(r.WebSocket.all.length, 2);
});

test('revoked (4001): a refusal state, never reconnected; a fresh token is the person\'s act and is read at the next connection', () => {
  const r = rig(); const sock = r.sock(); sock.open().ctl('host-present');
  sock.shut(4001);
  assert.deepEqual(r.log.closes, ['revoked']);
  r.timers.tick(600000); assert.equal(r.WebSocket.all.length, 1);
  r.holder.token = 'fresh-token';
  r.transport.subscribe({}, () => {}, () => {}, () => {});
  assert.deepEqual(r.sock().protocols, [SUBPROTOCOL, 'bearer.fresh-token']);
  assert.equal(r.WebSocket.all.length, 2);
});

test('no token: nothing is opened, no loop, and the client is told; a token put in later is used', () => {
  const r = rig({ token: '' });
  assert.equal(r.WebSocket.all.length, 0); assert.deepEqual(r.log.closes, ['no-token']);
  r.timers.tick(600000); assert.equal(r.WebSocket.all.length, 0); assert.equal(r.timers.pending(), 0);
  r.holder.token = 'given-by-the-person'; r.transport.nudge();
  assert.equal(r.WebSocket.all.length, 1); assert.deepEqual(r.sock().protocols, [SUBPROTOCOL, 'bearer.given-by-the-person']);
});

test('a reply delivered twice is passed on once: by reply id, by occurrence, across a reconnect and after a host restart with the same id', () => {
  const r = rig(); let sock = r.sock(); sock.open().ctl('host-present');
  sock.frame(reply('a', 'hello')); sock.frame(reply('a', 'hello'));
  assert.equal(r.log.frames.length, 1, 'the same reply twice');
  sock.frame(reply('b', 'second', 'occ-b', 'reply-a'));   // a host that restarted and reuses a reply id for another occurrence
  assert.equal(r.log.frames.length, 1, 'same reply id');
  sock.frame(reply('c', 'third', 'a', 'reply-new'));   // the same occurrence under another reply id
  assert.equal(r.log.frames.length, 1, 'same occurrence');
  sock.shut(1006); r.timers.tick(1500); sock = r.sock(); sock.open().ctl('host-present');
  sock.frame(reply('a', 'hello')); sock.frame(reply('d', 'fourth'));
  assert.deepEqual(r.log.frames.map((x) => x.f.delivered), ['hello', 'fourth'], 'a retry that re-delivers an earlier reply shows it once');
  assert.deepEqual(r.log.frames.map((x) => x.seq), [1, 2]);
});

test('after the host is (back) there the messages the person sent are asked about, because nothing is replayed', () => {
  const r = rig(); r.transport.track(['m1', 'm2']); const sock = r.sock(); sock.open().ctl('host-present');
  assert.deepEqual(sock.frames.map((f) => f.body), [{ kind: 'status-query', messageId: 'm1' }, { kind: 'status-query', messageId: 'm2' }]);
  assert.ok(sock.frames.every((f) => f.routing.t === 'msg'));
  r.transport.untrack('m1'); sock.ctl('host-absent'); sock.ctl('host-present');
  assert.equal(sock.frames.length, 3); assert.equal(sock.frames[2].body.messageId, 'm2');
});

test('a frame over 1 MiB is never sent: it is a refusal over-limit, and a frame within the limit goes', async () => {
  const r = rig(); const sock = r.sock(); sock.open().ctl('host-present');
  const big = await r.transport.request({ kind: 'message', id: 'big', words: 'x'.repeat(MAX_FRAME_BYTES) });
  assert.equal(big[0].kind, 'refusal'); assert.equal(big[0].class, 'over-limit'); assert.equal(big[0].messageId, 'big');
  assert.equal(sock.sent.length, 0, 'not sent');
  const multi = await r.transport.request({ kind: 'message', id: 'wide', words: 'é'.repeat(MAX_FRAME_BYTES / 2) });   // two bytes each: the limit is bytes, not characters
  assert.equal(multi[0].class, 'over-limit');
  const near = r.transport.request({ kind: 'message', id: 'near', words: 'x'.repeat(MAX_FRAME_BYTES - 200) });
  assert.equal(sock.sent.length, 1); sock.frame({ kind: 'receipt', state: 'accepted', messageId: 'near' }); await near;
});

test('a request with no connection rejects (the outcome is unknown) and a request that gets no answer rejects at its timeout', async () => {
  const r = rig(); await assert.rejects(r.transport.request({ kind: 'message', id: 'm1' }), /not connected/);
  const sock = r.sock(); sock.open().ctl('host-present');
  const pending = r.transport.request({ kind: 'message', id: 'm1', words: 'hi' });
  r.timers.tick(15000); await assert.rejects(pending, /no answer/);
  const lost = r.transport.request({ kind: 'message', id: 'm2', words: 'hi' });
  sock.shut(1006); await assert.rejects(lost, /lost/);
});

test('bodies that are not one JSON object, binary data and unknown lines are ignored, never guessed at', () => {
  const r = rig(); const sock = r.sock(); sock.open();
  sock.onmessage({ data: new ArrayBuffer(4) });
  sock.say({ t: 'msg', from: 'host' }, 'not json'); sock.say({ t: 'msg', from: 'host' }, '[1,2]'); sock.say({ t: 'x' }); sock.onmessage({ data: 'not a routing line' });
  assert.deepEqual([r.log.frames, r.log.records, r.log.closes], [[], [], []]);
});

test('a hidden tab is not reconnected until it is shown; shown again it is reconnected at once and the wait starts over', () => {
  const listeners = {}; const doc = { hidden: false, addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => {} };
  const r = rig({ doc, hiddenPauseMs: 60000 }); const sock = r.sock(); sock.open().ctl('host-present');
  doc.hidden = true; listeners.visibilitychange();
  sock.shut(1006); r.timers.tick(1500); assert.equal(r.WebSocket.all.length, 2, 'hidden for a moment only: a lost link is reopened');
  r.sock().fail();   // and lost again
  r.timers.tick(61000);   // now hidden for long
  const count = r.WebSocket.all.length;
  r.timers.tick(100000); assert.equal(r.WebSocket.all.length, count, 'no attempts while hidden for long');
  assert.equal(r.transport.state().waitingForTab, true);
  doc.hidden = false; listeners.visibilitychange();
  assert.equal(r.WebSocket.all.length, count + 1, 'asked at once when shown');
  assert.equal(r.transport.state().waitingForTab, false);
});

test('stop() and suspend() close the link and nothing comes back by itself; subscribe resumes after a suspend', () => {
  const r = rig(); const sock = r.sock(); sock.open().ctl('host-present');
  r.transport.suspend(); assert.equal(sock.readyState, 3); r.timers.tick(100000); assert.equal(r.WebSocket.all.length, 1);
  r.transport.subscribe({}, () => {}, () => {}, () => {}); assert.equal(r.WebSocket.all.length, 2);
  r.transport.stop(); r.timers.tick(100000); assert.equal(r.WebSocket.all.length, 2); assert.equal(r.timers.pending(), 0);
});

// ---- the channel client on top ---------------------------------------------------------------------------------------------------------------------------------------------------------
function clientRig(opts = {}) {
  const r = rig(opts); const replies = [];
  const client = createChannelClient({ transport: r.transport, resident: { individualId: 'individual:test', host: { kind: 'relay' } }, encounter: 'enc:test', participant: { id: 'p:test', kind: 'human', name: 'You', standing: 'guest', individualId: null },
    source: 'plc:t1', newId: () => 'm1', onReply: (x) => replies.push(x) });
  return { ...r, client, replies, state: () => client.view().availability };
}
test('the client says what the relay says: available, unavailable, unreachable, insecure, superseded, revoked, needs a token', async () => {
  const c = clientRig(); c.client.connect(); const sock = c.sock();
  assert.equal(c.state().state, 'connecting');
  sock.open().ctl('host-present'); assert.equal(c.state().state, 'available');
  sock.ctl('host-absent'); assert.equal(c.state().state, 'unavailable');
  sock.shut(1006); assert.equal(c.state().state, 'unreachable');
  c.timers.tick(1500); c.sock().open().ctl('host-present'); assert.equal(c.state().state, 'available', 'back after the reconnect');
  c.sock().shut(4000); assert.equal(c.state().state, 'superseded');
  c.client.connect(); c.sock().open().ctl('host-present'); assert.equal(c.state().state, 'available', 'the person chose to use it here');
  c.sock().shut(4001); assert.equal(c.state().state, 'revoked');
  const d = clientRig(); d.client.connect(); d.sock().fail(); assert.deepEqual(d.state(), { state: 'unreachable', reason: 'insecure' });
  const e = clientRig({ token: '' }); e.client.connect(); assert.equal(e.state().state, 'needs-token');
});

test('send over a relay: the receipts arrive pushed, her reply once, and the screen words come from the model', async () => {
  const c = clientRig(); c.client.connect(); const sock = c.sock(); sock.open().ctl('host-present');
  const sending = c.client.send('hello', { occId: 'occ:m1' });
  assert.equal(sock.frames.at(-1).body.kind, 'message'); assert.equal(sock.frames.at(-1).body.from.participant.id, 'p:test');
  sock.frame({ kind: 'receipt', state: 'accepted', messageId: 'm1' });
  await sending;
  sock.frame({ kind: 'receipt', state: 'delivered', messageId: 'm1', worldSeq: 1 });
  sock.frame(reply('x', 'a reply')); sock.frame(reply('x', 'a reply'));
  const v = c.client.view();
  assert.deepEqual(v.messages[0].states, ['accepted', 'delivered']);
  assert.equal(c.replies.length, 1); assert.equal(c.replies[0].text, 'a reply');
  // a message the relay could not forward is a refusal and never "sent"
  sock.ctl('host-absent');
  const second = c.client.send('again'); sock.ctl('refused', { reason: 'no-host', for: 'msg' }); await second;
  assert.equal(c.client.view().messages[1].state, 'unavailable');
});

test('the status line on the relay path never says the mind is on this computer', () => {
  for (const [availability, kind] of [[{ state: 'available' }, 'available'], [{ state: 'unavailable' }, 'unavailable'], [{ state: 'unreachable' }, 'unreachable'], [{ state: 'unreachable', reason: 'insecure' }, 'insecure'],
    [{ state: 'superseded' }, 'superseded'], [{ state: 'revoked' }, 'revoked'], [{ state: 'needs-token' }, 'needs-token'], [{ state: 'connecting' }, 'checking']]) {
    const s = statusOf({ availability, name: 'Ada', address: 'relay.example', via: 'relay' });
    assert.equal(s.kind, kind);
    assert.ok(!/this computer|tab is closed|host at/i.test(s.sentence + ' ' + (s.reason || '') + ' ' + (s.detail || '')) || s.kind === 'superseded' && /another tab/.test(s.sentence), s.kind + ': ' + s.sentence);
  }
  assert.equal(statusOf({ availability: { state: 'available' }, name: 'Ada', address: 'x', via: 'relay' }).sentence, 'Connected to Ada through a relay.');
  assert.equal(statusOf({ availability: { state: 'unreachable', reason: 'insecure' }, name: 'Ada', address: 'x', via: 'relay' }).sentence, 'Could not connect securely.');
  assert.equal(statusOf({ availability: { state: 'revoked' }, name: 'Ada', address: 'x', via: 'relay' }).sentence, 'You are not allowed to use this connection any more. Nothing can be sent.');
  assert.equal(statusOf({ availability: { state: 'superseded' }, name: 'Ada', address: 'x', via: 'relay' }).sentence, 'This conversation was opened in another tab, so it stopped here.');
  assert.equal(statusOf({ availability: { state: 'available' }, name: 'Ada', address: 'x' }).sentence, 'Connected to Ada on this computer.', 'the computer path is unchanged');
});

test('checkRelay: one look at the relay, the token only as a subprotocol, every ending named', async () => {
  const run = (script, args = {}) => { const WebSocket = createFakeWebSocket(), timers = createFakeTimers(); const p = checkRelay({ url: URL_OK, token: TOKEN, WebSocket, timers, timeoutMs: 5000, ...args }); script({ sock: WebSocket.last(), timers, WebSocket }); return p; };
  assert.deepEqual(await run(({ sock }) => { sock.open().ctl('host-present'); }), { kind: 'available' });
  assert.deepEqual(await run(({ sock }) => { sock.open().ctl('host-absent'); }), { kind: 'unavailable' });
  assert.deepEqual(await run(({ sock }) => { sock.fail(); }), { kind: 'insecure' });
  assert.deepEqual(await run(({ timers }) => { timers.tick(5000); }), { kind: 'unreachable' });
  assert.deepEqual(await run(({ sock }) => { sock.open().shut(4001); }), { kind: 'revoked' });
  assert.deepEqual(await run(({ sock }) => { sock.open().shut(4000); }), { kind: 'superseded' });
  assert.deepEqual(await run(() => {}, { token: '' }), { kind: 'no-token' });
  let sock; await run((x) => { sock = x.sock; x.sock.open().ctl('host-present'); });
  assert.deepEqual(sock.protocols, [SUBPROTOCOL, 'bearer.' + TOKEN]); assert.ok(!sock.url.includes(TOKEN)); assert.equal(sock.sent.length, 0, 'nothing is sent'); assert.equal(sock.closedWith, 1000);
});
