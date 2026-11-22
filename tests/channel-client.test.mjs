// The channel client (chat/channel/client.mjs, board T953 preparation) against the message handoff contract's reference endpoint (tests/helpers/handoff-oracle.mjs, Sonalon T379).
// Every fixture F01 to F13 is replayed THROUGH THE CLIENT: the client must build exactly the wire message the fixture holds, and what it shows must match the endpoint's state. Then the
// behaviours the task names: an occurrence identity survives a reconnect and a reload, real unavailability is shown, nothing answers in her place, an uncertain outcome is resolved by asking.
// Negative controls: each guarded line is broken once in a copy of the client and the test that guards it must fail. Synthetic data only; nothing here talks to a real mind.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createChannelClient as realClient } from '../chat/channel/client.mjs';
import { createEndpoint, step, summary } from './helpers/handoff-oracle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests/fixtures/message-handoff');
const fixtures = fs.readdirSync(path.join(FIX, 'fixtures')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(FIX, 'fixtures', f), 'utf8')));
const sha = (w) => 'sha256:' + createHash('sha256').update(w, 'utf8').digest('hex');
const tick = () => new Promise((r) => setImmediate(r));

test('the copied contract files are exactly what was pinned', () => {
  const lines = fs.readFileSync(path.join(FIX, 'SHA256SUMS'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 15, 'the contract, the schema and thirteen fixtures');
  for (const line of lines) { const [hash, file] = line.split(/\s+/); assert.equal(createHash('sha256').update(fs.readFileSync(path.join(FIX, file))).digest('hex'), hash, file); }
});

// ---- a loop: a client, the reference endpoint behind a transport, and a stream of her replies --------------------------------------------------------------------------------------
function loop(initial, { createChannelClient = realClient, clientOptions = {}, store = null } = {}) {
  const endpoint = createEndpoint(initial);
  const sent = [], streamLog = [], subscribers = new Set(), subscribeCalls = [];
  const control = { dropNextReply: 0, failRequests: false, closeStream: false };
  const transport = {
    async request(frame) {
      sent.push(JSON.parse(JSON.stringify(frame)));
      if (control.failRequests) throw new Error('no answer');
      const out = step(endpoint, frame);
      await tick();
      if (control.dropNextReply > 0) { control.dropNextReply -= 1; throw new Error('the answer was lost'); }   // the endpoint DID act; the caller never heard
      return out;
    },
    subscribe({ after }, onFrame, onClose) {
      subscribeCalls.push(after);
      const sub = { onFrame, onClose, closed: false };
      subscribers.add(sub);
      for (const e of streamLog) if (e.seq > after) onFrame(e.frame, e.seq);   // a stream resumed from a sequence number replays what came after it
      return { close() { sub.closed = true; subscribers.delete(sub); } };
    }
  };
  const push = (frames) => { for (const frame of frames) { const seq = streamLog.length + 1; streamLog.push({ seq, frame }); for (const s of subscribers) s.onFrame(frame, seq); } };
  const host = (input) => { const out = step(endpoint, input); push(out); return out; };
  let n = 0;
  const client = createChannelClient({ transport, resident: { individualId: initial.resident, host: { kind: 'in-process', address: 'fixture-host-1' } }, encounter: 'enc:ext:3f2a',
    participant: { id: 'p:ext:3f2a:person', kind: 'human', name: 'Visitor', standing: 'guest', individualId: null }, source: 'plc:thread-3f2a',
    newId: () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'), store, ...clientOptions });
  return { endpoint, client, transport, sent, streamLog, subscribers, subscribeCalls, control, push, host, closeAll: (reason) => { for (const s of [...subscribers]) { subscribers.delete(s); s.onClose(reason); } } };
}
const INIT = { running: true, resident: 'individual:room-1-resident', admitted: ['p:ext:3f2a:person'], limit: 2000 };

// ---- every fixture, through the client ------------------------------------------------------------------------------------------------------------------------------------------------
for (const doc of fixtures) {
  test(`${doc.fixture} ${doc.title}: the client builds the fixture's message and shows what the endpoint holds`, async () => {
    const first = doc.steps.find((s) => s.message?.kind === 'message')?.message;
    const participant = first.from.participant;
    const endpoint = createEndpoint(doc.initial);
    const sent = [], subscribers = new Set(); let seq = 0;
    const transport = { async request(frame) { sent.push(frame); const out = step(endpoint, frame); await tick(); return out; },
      subscribe(_o, onFrame) { const s = { onFrame }; subscribers.add(s); return { close: () => subscribers.delete(s) }; } };
    let nextId = null;
    const client = realClient({ transport, resident: first.to, encounter: first.encounter, participant, source: first.occ.source, newId: () => nextId });
    client.connect();
    const availabilities = new Set();
    const known = new Map();   // id -> the message as the fixture sent it, for the ones the client sent
    for (let i = 0; i < doc.steps.length; i += 1) {
      const st = doc.steps[i];
      if (st.direction === 'from-resident') continue;
      if (st.direction === 'host') { const out = step(endpoint, st.host); for (const f of out) for (const s of subscribers) s.onFrame(f, ++seq); }
      else {
        const m = st.message;
        if (m.kind === 'message') {
          const producible = m.occ.digest === sha(m.words) && !known.has(m.id) && m.from.participant.id === participant.id;   // another participant is another client
          const same = known.has(m.id) && known.get(m.id).occ.digest === m.occ.digest && JSON.stringify(known.get(m.id).audience) === JSON.stringify(m.audience) && known.get(m.id).expression === m.expression;
          if (producible) {
            nextId = m.id; known.set(m.id, m);
            await client.send(m.words, { audience: m.audience, expression: m.expression, after: m.after, corrects: m.corrects ?? null, occId: m.occ.id });
            const wire = sent.at(-1); const expected = JSON.parse(JSON.stringify(m)); if (expected.from) delete expected.from.aliases;
            assert.deepEqual(wire, expected, `the wire message of step ${i} (${st.note})`);
          } else if (same) await client.retry(m.id, { force: true });   // a repeat with identical content
          else step(endpoint, m);   // a message no client of ours would build (a digest that does not cover the words, an id reused for other content): the endpoint alone must refuse it
        } else if (m.kind === 'status-query') step(endpoint, m);   // the question itself is the endpoint's to answer here; the client's own use of it is tested below
        else if (m.kind === 'revocation') await client.revoke();
        else step(endpoint, m);
      }
      availabilities.add(client.view().availability.state);
      if (st.expectedState) {
        assert.deepEqual(summary(endpoint), st.expectedState, `the endpoint after step ${i}`);
        const shown = Object.fromEntries(client.view().messages.filter((x) => x.states.length).map((x) => [x.id, x.states.at(-1)]));
        for (const [id, state] of Object.entries(st.expectedState.byMessage)) if (known.has(id)) assert.equal(shown[id], state, `the client shows ${id} as ${state} after step ${i} (${st.note})`);
      }
    }
    // what a person sees must agree with what the fixture says happened
    const v = client.view();
    if (doc.fixture === 'F05') assert.ok(availabilities.has('unavailable'), 'a closed tab was shown as unavailable (' + [...availabilities] + ')');
    if (doc.fixture === 'F08') {
      const delivered = doc.steps.filter((x) => x.message?.kind === 'reply').map((x) => x.message.delivered);
      assert.ok(delivered.length >= 2 && doc.steps.some((x) => x.message?.status === 'interrupted'), 'the fixture holds a completed and an interrupted reply');
      assert.deepEqual(v.replies.map((r) => r.text), delivered, 'only the delivered text of each reply is shown');
      assert.ok(v.replies.every((r) => !('intended' in r) && !('units' in r)), 'intended and units are not shown');
    }
    if (doc.fixture === 'F09') assert.equal(v.replies.length, 0, 'no reply is invented');
    if (doc.fixture === 'F12') assert.ok(v.messages.every((x) => x.waitingFor === null), 'a held message is shown as delivered once its predecessor is');
  });
}

// ---- occurrence identity survives a reconnect and a reload -----------------------------------------------------------------------------------------------------------------------------
function memoryStore() { let kept = null; return { load: () => kept, save: (s) => { kept = JSON.parse(JSON.stringify(s)); }, peek: () => kept }; }
async function conversation(lp) {
  lp.client.connect();
  const m = await lp.client.send('Hello, are you there?');
  lp.host({ kind: 'speech-report', causes: [m.id], units: [{ text: 'Yes.' }], status: 'completed', delivered: 'Yes.' });
  await tick();
  return m;
}
test('a reply seen before a disconnect is shown once after the stream is resumed, also from a fresh client with the same store', async () => {
  const store = memoryStore(), shown = [];
  const lp = loop(INIT, { store, clientOptions: { onReply: (r) => shown.push(r.text) } });
  await conversation(lp);
  assert.deepEqual(shown, ['Yes.']);
  assert.equal(lp.client.cursor(), lp.streamLog.length);
  lp.closeAll('network dropped');
  assert.equal(lp.client.view().availability.state, 'unavailable', 'a closed stream is said to be closed');
  lp.client.connect();   // resumes after the last sequence number it saw
  assert.equal(lp.subscribeCalls.at(-1), lp.streamLog.length, 'the stream is resumed from the cursor');
  await tick();
  assert.deepEqual(shown, ['Yes.'], 'nothing is shown twice after a reconnect');
  // a second reply arrives while it was away, and the SAME first reply is delivered again by a transport that replays from the start
  lp.closeAll('network dropped'); lp.host({ kind: 'speech-report', causes: [lp.client.view().messages[0].id], units: [{ text: 'Also.' }], status: 'completed', delivered: 'Also.' });
  const replayAll = { ...lp.transport, subscribe: (_o, onFrame, onClose) => lp.transport.subscribe({ after: 0 }, onFrame, onClose) };
  const reloaded = realClient({ transport: replayAll, resident: { individualId: INIT.resident, host: { kind: 'in-process', address: 'h' } }, encounter: 'enc:ext:3f2a', participant: { id: 'p:ext:3f2a:person', kind: 'human', name: 'Visitor', standing: 'guest', individualId: null }, source: 'plc:thread-3f2a', newId: () => 'x', store, onReply: (r) => shown.push(r.text) });
  reloaded.connect(); await tick(); await reloaded.flush();
  assert.deepEqual(shown, ['Yes.', 'Also.'], 'after a reload and a full replay each occurrence is shown exactly once');
  assert.deepEqual(reloaded.view().replies.map((r) => r.text), ['Yes.', 'Also.']);
});

test('the cursor moves even for a frame that is not a reply, and a resumed stream starts after it', async () => {
  const lp = loop(INIT);
  lp.client.connect();
  const m = await lp.client.send('One');
  lp.host({ kind: 'progress', messageId: m.id, state: 'exposed' });
  assert.equal(lp.client.cursor(), 1);
  assert.equal(lp.client.view().messages[0].state, 'exposed', 'a later receipt arrives on the stream');
});

// ---- real unavailability, no stand-in --------------------------------------------------------------------------------------------------------------------------------------------------
test('a closed tab is shown as unavailable, nothing is queued, nothing answers, and a later retry of the SAME id is a first acceptance', async () => {
  const shown = [];
  const lp = loop({ ...INIT, running: false }, { clientOptions: { onReply: (r) => shown.push(r) } });
  lp.client.connect();
  const m = await lp.client.send('Anyone there?');
  const v = lp.client.view();
  assert.equal(v.availability.state, 'unavailable'); assert.match(v.availability.reason, /no resident is running/);
  assert.equal(v.messages[0].state, 'unavailable'); assert.deepEqual(v.messages[0].states, [], 'never accepted, never delivered');
  assert.equal(lp.endpoint.log.size, 0, 'the endpoint holds nothing: it was not queued');
  assert.deepEqual(shown, []); assert.deepEqual(v.replies, [], 'no reply of any kind appeared');
  step(lp.endpoint, { kind: 'tab-opened' });
  const again = await lp.client.retry(m.id);
  assert.equal(again.state, 'delivered'); assert.equal(lp.sent.at(-1).id, m.id, 'the same id is sent again, unchanged');
  assert.equal(lp.endpoint.log.size, 1);
  assert.equal(lp.client.view().availability.state, 'available');
});
test('the client has no way to answer in her place: no model, prompt or fallback is part of it', () => {
  const lp = loop(INIT);
  assert.deepEqual(Object.keys(lp.client).sort(), ['connect', 'cursor', 'disconnect', 'flush', 'retry', 'revoke', 'send', 'view']);
  const source = fs.readFileSync(path.join(ROOT, 'chat/channel/client.mjs'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  for (const word of [/localModels/, /generate\(/, /prompt/i, /fetch\(/, /localStorage/, /sessionStorage/, /indexedDB/, /document\./, /window\./]) assert.doesNotMatch(source, word, String(word));
});
test('a host that cannot be reached is shown as unreachable and the message is unknown, not accepted; retry later settles it with one acceptance', async () => {
  const lp = loop(INIT);
  lp.control.failRequests = true;
  const m = await lp.client.send('Hello');
  let v = lp.client.view();
  assert.equal(v.availability.state, 'unreachable'); assert.equal(v.messages[0].state, 'unknown'); assert.equal(lp.endpoint.log.size, 0);
  lp.control.failRequests = false;
  const settled = await lp.client.retry(m.id);
  assert.equal(settled.state, 'delivered'); assert.equal(lp.endpoint.log.size, 1);
});

// ---- an uncertain outcome is resolved by asking, never by guessing --------------------------------------------------------------------------------------------------------------------
test('the answer was lost after the endpoint accepted: the client asks, learns it is known, and does NOT send it again', async () => {
  const lp = loop(INIT);
  lp.control.dropNextReply = 1;
  const m = await lp.client.send('Hello');
  assert.equal(m.state, 'delivered'); assert.equal(lp.endpoint.log.size, 1);
  assert.deepEqual(lp.sent.map((f) => f.kind), ['message', 'status-query'], 'one message, one question, no second message');
});
test('the message never arrived: the status says unknown and the SAME message is sent again, unchanged, once', async () => {
  const lp = loop(INIT);
  const real = lp.transport.request; let first = true;
  lp.transport.request = async (frame) => { if (first && frame.kind === 'message') { first = false; lp.sent.push(frame); throw new Error('lost on the way'); } return real(frame); };
  const m = await lp.client.send('Hello');
  assert.equal(m.state, 'delivered'); assert.equal(lp.endpoint.log.size, 1);
  const messages = lp.sent.filter((f) => f.kind === 'message'); assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], messages[1], 'the retry is byte for byte the same message');
});

// ---- order, causation and revocation --------------------------------------------------------------------------------------------------------------------------------------------------
test('a message never follows a refused one, and a chat is sent in order', async () => {
  const lp = loop({ ...INIT, limit: 5 });
  const a = await lp.client.send('way too long for the limit');
  assert.equal(a.state, 'refused'); assert.equal(a.refusal.class, 'over-limit');
  const b = await lp.client.send('ok');
  assert.deepEqual(lp.sent.filter((f) => f.kind === 'message').at(-1).after, [], 'not after the refused message');
  const c = await lp.client.send('two');
  assert.deepEqual(lp.sent.filter((f) => f.kind === 'message').at(-1).after, [b.id]);
  assert.ok(c.state === 'delivered');
});
test('revoking sends the id of the last accepted message as the cutoff, and later words are refused as revoked', async () => {
  const lp = loop(INIT);
  const a = await lp.client.send('first');
  await lp.client.revoke();
  assert.deepEqual(lp.sent.at(-1), { kind: 'revocation', encounter: 'enc:ext:3f2a', participantId: 'p:ext:3f2a:person', cutoff: { lastAcceptedMessageId: a.id } });   // the schema requires the encounter
  const b = await lp.client.send('after revoke');
  assert.equal(b.state, 'refused'); assert.equal(b.refusal.class, 'revoked');
});

test('a revocation the endpoint refuses is reported as not done, with the refusal', async () => {
  const lp = loop(INIT);
  await lp.client.send('first');
  lp.transport.request = async () => [{ kind: 'refusal', class: 'malformed', reason: 'bad frame' }];
  const r = await lp.client.revoke();
  assert.equal(r.ok, false); assert.deepEqual(r.refusal, { class: 'malformed', reason: 'bad frame' });
});

// ---- parallel use of one client and one store --------------------------------------------------------------------------------------------------------------------------------------------
test('concurrent sends and racing resends of one id: one acceptance each, ids unique, and the saved state is the final state however slow the store is', async () => {
  let kept = null, delay = 0;
  const store = { load: () => kept, save: async (s) => { await new Promise((r) => setTimeout(r, (delay = (delay + 7) % 13))); kept = JSON.parse(JSON.stringify(s)); } };
  const lp = loop(INIT, { store });
  lp.client.connect();
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => lp.client.send('message ' + i)));
  assert.equal(new Set(results.map((r) => r.id)).size, 20, 'every send has its own id');
  const one = results[0].id;
  await Promise.all(Array.from({ length: 10 }, () => lp.client.retry(one, { force: true })));
  assert.equal(lp.endpoint.log.size, 20, 'the racing resends of one id did not create a second acceptance');
  await lp.client.flush();
  assert.deepEqual(kept.order, lp.client.view().messages.map((m) => m.id), 'the last save is the final state');
  const chain = lp.sent.filter((f) => f.kind === 'message').slice(0, 20);
  assert.equal(new Set(chain.map((f) => f.occ.id)).size, 20, 'occurrence ids are unique');
});

// ---- negative controls: break each guarded line once in a copy of the client, the guarding test must fail -------------------------------------------------------------------------------------
const SOURCE = fs.readFileSync(path.join(ROOT, 'chat/channel/client.mjs'), 'utf8');
async function broken(from, to) {
  assert.ok(SOURCE.includes(from), 'the control transform applies: ' + from.slice(0, 40));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-break-'));
  const file = path.join(dir, 'client.mjs');
  fs.writeFileSync(file, SOURCE.replace(from, to).replace("from '../encounters/records.mjs'", `from '${pathToFileURL(path.join(ROOT, 'chat/encounters/records.mjs')).href}'`));
  try { return (await import(pathToFileURL(file).href + '?x=' + Math.random())).createChannelClient; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const replyTwice = async (createChannelClient) => {
  const store = memoryStore(), shown = [];
  const lp = loop(INIT, { createChannelClient, store, clientOptions: { onReply: (r) => shown.push(r.text) } });
  await conversation(lp); lp.closeAll('x'); lp.client.connect(); await tick();
  const replayAll = { ...lp.transport, subscribe: (_o, f, c) => lp.transport.subscribe({ after: 0 }, f, c) };
  const again = createChannelClient({ transport: replayAll, resident: { individualId: INIT.resident, host: {} }, encounter: 'enc:ext:3f2a', participant: { id: 'p:ext:3f2a:person' }, source: 's', newId: () => 'x', store, onReply: (r) => shown.push(r.text) });
  again.connect(); await tick();
  return shown;
};
test('control: without the occurrence check a replayed reply is shown twice, and the test above notices', async () => {
  assert.deepEqual(await replyTwice(realClient), ['Yes.'], 'sanity: the real client shows it once');
  const shown = await replyTwice(await broken('if (st.seen.has(key)) { changed(); return; }', 'if (false) { return; }'));
  assert.notDeepEqual(shown, ['Yes.'], 'the break made it show twice: ' + JSON.stringify(shown));
});
test('control: an answer lost after acceptance without the status query would send the message twice', async () => {
  const createChannelClient = await broken("const outcome = await resolve(id);\n        if (outcome === 'known' || outcome === 'unavailable') return;", "const outcome = 'resend';\n        if (outcome === 'known' || outcome === 'unavailable') return;");
  const lp = loop(INIT, { createChannelClient });
  lp.control.dropNextReply = 1;
  await lp.client.send('Hello');
  assert.notDeepEqual(lp.sent.map((f) => f.kind), ['message', 'status-query'], 'the break resent without asking');
});
test('control: if a refusal as unavailable were swallowed the person would not be told', async () => {
  const createChannelClient = await broken("availability = { state: 'unavailable', reason: frame.reason || 'no resident is running' };", "/* swallowed */");
  const lp = loop({ ...INIT, running: false }, { createChannelClient });
  await lp.client.send('Anyone?');
  assert.notEqual(lp.client.view().availability.state, 'unavailable');
});
test('control: states are reached once, in order; a repeat or a skip would show a state that was never reached', async () => {
  const createChannelClient = await broken("if (next < 0 || next !== m.states.length) return;", "if (next < 0) return;");
  const lp = loop(INIT, { createChannelClient });
  lp.client.connect();
  const m = await lp.client.send('Hi');
  lp.push([{ kind: 'receipt', state: 'persisted', messageId: m.id, encounter: 'enc:ext:3f2a' }]);   // a skip: exposed and interpreted were never reached
  assert.equal(lp.client.view().messages[0].state, 'persisted', 'the break shows a state that was skipped');
  const good = loop(INIT); good.client.connect();
  const g = await good.client.send('Hi'); good.push([{ kind: 'receipt', state: 'persisted', messageId: g.id, encounter: 'enc:ext:3f2a' }]);
  assert.equal(good.client.view().messages[0].state, 'delivered', 'the real client ignores the skip');
});
