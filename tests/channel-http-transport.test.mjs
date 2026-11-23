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
