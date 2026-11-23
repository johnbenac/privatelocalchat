// SPDX-License-Identifier: AGPL-3.0-only
// The channel client's HTTP transport against a small local server that speaks the message handoff binding (one POST route, NDJSON answers, no subscription, replies fetched by a status query).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHttpTransport, parseRecords } from '../chat/channel/http-transport.mjs';
import { createChannelClient } from '../chat/channel/client.mjs';

const ND = 'application/x-ndjson';
function server(handler) {
  const seen = [];
  const s = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    let frame; try { frame = JSON.parse(body); } catch { frame = null; }
    seen.push({ method: req.method, path: req.url, frame });
    handler(frame, res, seen);
  });
  return new Promise((resolve) => s.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${s.address().port}/message-handoff`, seen, close: () => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }) })));
}
const lines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n';
const reply = (id, text) => ({ kind: 'reply', id: 'reply-' + id, encounter: 'enc:test', occ: { source: 'host:test', id, digest: 'd-' + id }, delivered: text, intended: text, status: 'complete', causes: ['m1'] });

test('parseRecords reads newline-delimited objects and refuses anything else whole', () => {
  assert.deepEqual(parseRecords('{"a":1}\n\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
  assert.throws(() => parseRecords('{"a":1}\nnot json\n'), /newline-delimited JSON/);
  assert.throws(() => parseRecords('[1]\n'), /not an object/);
});

test('request posts one JSON object and returns the answer records; a written refusal is an answer', async () => {
  const srv = await server((frame, res) => {
    if (frame?.kind === 'message') { res.writeHead(200, { 'Content-Type': ND }); res.end(lines([{ kind: 'receipt', messageId: frame.id, state: 'accepted' }])); }
    else { res.writeHead(403, { 'Content-Type': ND }); res.end(lines([{ kind: 'refusal', class: 'not-admitted', reason: 'participant not admitted' }])); }
  });
  try {
    const t = createHttpTransport({ url: srv.url });
    assert.deepEqual(await t.request({ kind: 'message', id: 'm1' }), [{ kind: 'receipt', messageId: 'm1', state: 'accepted' }]);
    assert.equal((await t.request({ kind: 'message-x' }))[0].class, 'not-admitted');
    assert.equal(srv.seen[0].method, 'POST');
  } finally { await srv.close(); }
});

test('request REJECTS when nothing usable answered: a dead host, a plain HTTP error, a garbled body, a timeout', async () => {
  const dead = await server(() => {}); const deadUrl = dead.url; await dead.close();
  await assert.rejects(createHttpTransport({ url: deadUrl, timeoutMs: 500 }).request({ kind: 'status-query', messageId: 'm1' }));
  const bad = await server((f, res) => { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('boom'); });
  try { await assert.rejects(createHttpTransport({ url: bad.url }).request({ kind: 'x' }), /HTTP 500/); } finally { await bad.close(); }
  const garbled = await server((f, res) => { res.writeHead(200, { 'Content-Type': ND }); res.end('nope\n'); });
  try { await assert.rejects(createHttpTransport({ url: garbled.url }).request({ kind: 'x' }), /newline-delimited/); } finally { await garbled.close(); }
  const slow = await server(() => {});
  try { await assert.rejects(createHttpTransport({ url: slow.url, timeoutMs: 80 }).request({ kind: 'x' })); } finally { await slow.close(); }
});

test('the poll loop asks about tracked messages, passes each reply once with a growing seq, and replays the same occurrences without repeating them', async () => {
  let n = 0;
  const srv = await server((frame, res) => {
    n++;
    res.writeHead(200, { 'Content-Type': ND });
    res.end(lines([{ kind: 'status', messageId: frame.messageId, known: true }, reply('r1', 'first'), ...(n >= 2 ? [reply('r2', 'second')] : [])]));
  });
  try {
    const t = createHttpTransport({ url: srv.url, pollMs: 20 });
    const got = [];
    t.track('m1');
    const sub = t.subscribe({ after: 0 }, (frame, seq) => got.push([frame.delivered, seq]), () => {});
    await new Promise((r) => setTimeout(r, 300));
    sub.close();
    assert.deepEqual(got, [['first', 1], ['second', 2]], 'each occurrence once, however many polls repeated it');
    assert.ok(srv.seen.length >= 3, 'it kept polling');
    const frames = srv.seen.map((s) => s.frame);
    assert.ok(frames.every((f) => f.kind === 'status-query' && f.messageId === 'm1'), 'it only asks about the message it tracks');
    const before = srv.seen.length; await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.seen.length, before, 'closed: no more polls');
    const again = []; const sub2 = t.subscribe({ after: 1 }, (frame, seq) => again.push([frame.delivered, seq]), () => {}); sub2.close();
    assert.deepEqual(again, [['second', 2]], 'a resubscription after cursor 1 gets only what came after it');
  } finally { await srv.close(); }
});

test('an unreachable host is reported as closed with the reason unreachable and shows nothing', async () => {
  const dead = await server(() => {}); const url = dead.url; await dead.close();
  const t = createHttpTransport({ url, pollMs: 20, timeoutMs: 200 });
  t.track('m1'); const got = []; const reasons = [];
  const sub = t.subscribe({ after: 0 }, (f) => got.push(f), (why) => reasons.push(why));
  await new Promise((r) => setTimeout(r, 400)); sub.close();
  assert.deepEqual(got, []); assert.ok(reasons.includes('unreachable'));
});

test('with the channel client on top: a message is sent, its replies are shown once, a closed host is unavailable and nothing answers in her place', async () => {
  const replies = new Map();
  const srv = await server((frame, res) => {
    res.writeHead(200, { 'Content-Type': ND });
    if (frame.kind === 'message') {
      replies.set(frame.id, [reply('r-' + frame.id, 'hello back')]);
      return res.end(lines(['accepted', 'delivered', 'exposed', 'interpreted', 'persisted'].map((state) => ({ kind: 'receipt', messageId: frame.id, state, world: 1 }))));
    }
    res.end(lines([{ kind: 'status', messageId: frame.messageId, known: true }, ...(replies.get(frame.messageId) || [])]));
  });
  try {
    const transport = createHttpTransport({ url: srv.url, pollMs: 20 });
    const shown = []; let n = 0;
    const client = createChannelClient({ transport, resident: { individualId: 'individual:t', host: { kind: 'own-computer', address: srv.url } }, encounter: 'enc:test',
      participant: { id: 'p:t', kind: 'human', name: 'T', standing: 'guest', individualId: null }, source: 'plc:test', newId: () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'),
      onReply: (r) => shown.push(r.text) });
    client.connect();
    const m = await client.send('hello');
    transport.track(m.id);
    await new Promise((r) => setTimeout(r, 250));
    assert.deepEqual(shown, ['hello back'], 'shown once however often it was polled');
    client.disconnect(); transport.stop();
  } finally { await srv.close(); }
  const t2 = createHttpTransport({ url: srv.url, timeoutMs: 200 });
  await assert.rejects(t2.request({ kind: 'status-query', messageId: 'x' }), 'a closed host gives no answer: the client then says unreachable, never a substitute');
});

test('a poll that gets a refusal or a status passes it on as a record (the host ANSWERED); no answer at all is reported as unreachable, and the client says unreachable, not unavailable', async () => {
  let mode = 'status';
  const srv = await server((frame, res) => {
    res.writeHead(mode === 'refuse' ? 503 : 200, { 'Content-Type': ND });
    res.end(lines([mode === 'refuse' ? { kind: 'refusal', class: 'unavailable', messageId: frame.messageId, reason: 'stopped' } : { kind: 'status', messageId: frame.messageId, known: false, states: [] }]));
  });
  try {
    const probeId = '00000000-0000-4000-8000-0000000000aa';
    const transport = createHttpTransport({ url: srv.url, pollMs: 20, timeoutMs: 200, probeId });
    let n = 0;
    const client = createChannelClient({ transport, resident: { individualId: 'i', host: { kind: 'own-computer', address: srv.url } }, encounter: 'enc:test', participant: { id: 'p:t', kind: 'human', name: 'T', standing: 'guest', individualId: null }, source: 'plc:test', newId: () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0') });
    client.connect();
    const states = async () => { await new Promise((r) => setTimeout(r, 150)); return client.view().availability.state; };
    assert.equal(await states(), 'available', 'with nothing tracked it asks about the probe id and learns the host is there');
    assert.ok(srv.seen.every((s) => s.frame.messageId === probeId), 'only the probe id was asked about');
    mode = 'refuse'; assert.equal(await states(), 'unavailable', 'a refusal is unavailable');
    mode = 'status'; assert.equal(await states(), 'available', 'and it recovers when the host answers again');
    await srv.close();
    assert.equal(await states(), 'unreachable', 'no answer at all is unreachable, never unavailable');
    client.disconnect(); transport.stop();
  } finally { await srv.close(); }
});

// ---- the poll schedule: fast while something just happened, then the wait doubles to a ceiling; a hidden tab is not polled ------------------------------------------------------------------
function fakeClock() {
  let t = 0, id = 0; const q = new Map();
  return { now: () => t, timers: { set: (fn, ms) => { q.set(++id, { fn, at: t + ms }); return id; }, clear: (i) => { q.delete(i); } },
    async advance(ms) { const end = t + ms; for (;;) { const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; q.delete(next[0]); t = next[1].at; next[1].fn(); for (let i = 0; i < 20; i += 1) await Promise.resolve(); } t = end; },
    pending: () => q.size };
}
function scheduleRig(extra = {}) {
  const clock = fakeClock(); const polls = [];
  const listeners = {}; const doc = { hidden: false, addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => {} };
  const fetch = async (_u, init) => { polls.push(clock.now()); return { ok: true, text: async () => lines([{ kind: 'status', messageId: JSON.parse(init.body).messageId, known: true, states: [] }]), headers: { get: () => ND } }; };
  const transport = createHttpTransport({ url: 'http://127.0.0.1:1/message-handoff', fetch, timers: clock.timers, now: clock.now, doc, pollMs: 1500, probeId: '00000000-0000-4000-8000-0000000000aa', ...extra });
  return { clock, polls, doc, listeners, transport };
}
test('poll schedule: 1.5 s for 30 s after anything happened, then the wait doubles up to 15 s', async () => {
  const r = scheduleRig(); r.transport.subscribe({ after: 0 }, () => {}, () => {});
  await r.clock.advance(30000);
  const early = r.polls.length;
  assert.ok(early >= 19 && early <= 22, 'about one poll per 1.5 s while fresh: ' + early);
  const gaps = (from) => r.polls.slice(from).map((x, i, a) => (i ? x - a[i - 1] : null)).filter(Boolean);
  await r.clock.advance(120000);
  const g = gaps(early);
  assert.ok(g.some((x) => x >= 12000) && Math.max(...g) <= 15000, 'it backs off to the ceiling and no further: ' + g.join(','));
  assert.ok(g.every((x, i, a) => i === 0 || x >= a[i - 1]), 'the wait never shrinks while nothing arrives');
  assert.ok(r.polls.length - early < 20, 'about 40 polls in a few minutes would be too many: ' + (r.polls.length));
  r.transport.stop();
});
test('poll schedule: nudge (a send, Check status) and a reply reset it to fast', async () => {
  const r = scheduleRig(); r.transport.subscribe({ after: 0 }, () => {}, () => {});
  await r.clock.advance(150000);
  const before = r.polls.length; const last = r.polls.at(-1);
  r.transport.nudge();
  await r.clock.advance(6000);
  const after = r.polls.slice(before);
  assert.ok(after.length >= 3 && after[0] === 150000, 'it asked at once and then quickly: ' + after.join(','));
  assert.equal(r.transport.intervalMs(), 1500); assert.ok(last <= 150000);
  r.transport.stop();
});
test('poll schedule: a tab hidden for more than a minute is not polled; it is asked at once when shown', async () => {
  const r = scheduleRig(); r.transport.subscribe({ after: 0 }, () => {}, () => {});
  await r.clock.advance(5000);
  r.doc.hidden = true; r.listeners.visibilitychange();
  await r.clock.advance(70000);
  const mark = r.polls.length;
  await r.clock.advance(120000);
  assert.equal(r.polls.length, mark, 'no poll while hidden for long');
  r.doc.hidden = false; r.listeners.visibilitychange();
  await r.clock.advance(100);
  assert.equal(r.polls.length, mark + 1, 'asked at once on visible');
  r.transport.stop();
});
test('the same reply keeps the fast schedule', async () => {
  const clock = fakeClock(); let n = 0;
  const fetch = async (_u, init) => { const id = JSON.parse(init.body).messageId; n += 1; return { ok: true, text: async () => lines([{ kind: 'status', messageId: id, known: true }, ...(n % 20 === 0 ? [reply('r' + n, 'x')] : [])]), headers: { get: () => ND } }; };
  const t = createHttpTransport({ url: 'http://127.0.0.1:1/message-handoff', fetch, timers: clock.timers, now: clock.now, doc: null, pollMs: 1500 });
  t.track('m1'); const got = []; t.subscribe({ after: 0 }, (f) => got.push(f.delivered), () => {});
  await clock.advance(200000);
  assert.ok(got.length >= 2 && t.intervalMs() <= 15000);
  t.stop();
});

test('a message whose reply arrived is still asked about: a later poll delivers the missing receipts, the meter grows, and the word is not shown twice', async () => {
  let states = ['accepted', 'delivered', 'exposed'];
  const srv = await server((frame, res) => {
    res.writeHead(200, { 'Content-Type': ND });
    if (frame.kind === 'message') return res.end(lines(states.slice(0, 2).map((state) => ({ kind: 'receipt', messageId: frame.id, state, encounter: 'enc:test' }))));
    res.end(lines([{ kind: 'status', messageId: frame.messageId, known: true, states }, reply('r-late', 'the reply')]));
  });
  try {
    const transport = createHttpTransport({ url: srv.url, pollMs: 20 });
    const shown = []; let n = 0;
    const client = createChannelClient({ transport, resident: { individualId: 'i', host: { kind: 'own-computer', address: srv.url } }, encounter: 'enc:test', participant: { id: 'p:t', kind: 'human', name: 'T', standing: 'guest', individualId: null }, source: 'plc:test', newId: () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'), onReply: (r) => shown.push(r.text) });
    client.connect();
    const m = await client.send('hi'); transport.track(m.id);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(shown, ['the reply']); assert.deepEqual(client.view().messages[0].states, ['accepted', 'delivered', 'exposed']);
    states = ['accepted', 'delivered', 'exposed', 'interpreted', 'persisted'];   // the host records the later stages minutes after the reply
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(client.view().messages[0].states, states, 'the meter filled in from a later poll');
    assert.deepEqual(shown, ['the reply'], 'and the word was not shown again');
    client.disconnect(); transport.stop();
  } finally { await srv.close(); }
});
