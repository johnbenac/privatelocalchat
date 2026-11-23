// What the setup offers on its own (chat/mind/mind-setup.mjs discoverHost, checkHost): only for a page served from plain http on this computer, only from the host's own description,
// and a refused or blocked request is told apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverHost, checkHost, validateConfig } from '../chat/mind/mind-setup.mjs';

const page = (o) => ({ protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:7000', ...o });
const json = (body, ok = true) => async () => ({ ok, json: async () => body });
test('a page on this computer offers its own origin, and the host\'s description when it answers', async () => {
  assert.deepEqual(await discoverHost({ page: page(), fetch: async () => { throw new Error('down'); } }), { address: 'http://127.0.0.1:7000' });
  assert.deepEqual(await discoverHost({ page: page(), fetch: json({}, false) }), { address: 'http://127.0.0.1:7000' });
  const got = await discoverHost({ page: page({ hostname: 'localhost', origin: 'http://localhost:7000' }), fetch: json({ messageEndpoint: 'http://127.0.0.1:7100/message-handoff', origin: 'x', individualId: 'individual:a', name: 'Ada' }) });
  assert.deepEqual(got, { address: 'http://127.0.0.1:7100', resident: 'individual:a', name: 'Ada' });
});
test('anywhere else nothing is offered and nothing is asked', async () => {
  let asked = 0; const f = async () => { asked += 1; return { ok: true, json: async () => ({}) }; };
  for (const p of [page({ protocol: 'https:', origin: 'https://x.example', hostname: 'x.example' }), page({ hostname: 'example.org', origin: 'http://example.org' }), null]) assert.deepEqual(await discoverHost({ page: p, fetch: f }), {});
  assert.equal(asked, 0);
  const evil = await discoverHost({ page: page(), fetch: json({ messageEndpoint: 'http://evil.example/message-handoff', name: 'x'.repeat(500) }) });
  assert.deepEqual(evil, { address: 'http://127.0.0.1:7000' }, 'a description may not point the page away from this computer, nor be huge');
});
test('checkHost: blocked is told from unreachable, a refusal is an answer', async () => {
  const dead = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal((await checkHost({ address: 'http://127.0.0.1:9', fetch: dead, page: { protocol: 'https:', hostname: 'x.example' } })).kind, 'blocked');
  assert.equal((await checkHost({ address: 'http://127.0.0.1:9', fetch: dead, page: { protocol: 'http:', hostname: '127.0.0.1' } })).kind, 'unreachable');
  assert.equal((await checkHost({ address: 'nope', fetch: dead })).kind, 'invalid');
  const refuse = async () => ({ ok: false, status: 503, headers: { get: () => 'application/x-ndjson' }, text: async () => '{"kind":"refusal","class":"unavailable","messageId":null,"reason":"x"}\n' });
  assert.equal((await checkHost({ address: 'http://127.0.0.1:9', fetch: refuse })).kind, 'unavailable');
});
test('validateConfig bounds the fields', () => {
  assert.equal(validateConfig({ address: 'http://127.0.0.1:1', resident: 'r', encounter: 'e', participant: 'p', timeoutSeconds: 999 }).config.timeoutSeconds, 60);
  assert.deepEqual(validateConfig({ address: 'x', resident: '', encounter: 'e', participant: 'p' }).problems, ['address', 'resident']);
});
