import test from 'node:test';
import assert from 'node:assert/strict';
import { createEndpointTokens } from '../chat/provider/endpoint-tokens.mjs';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), raw: m }; };
const make = (storage = memory(), onSet = null) => ({ storage, t: createEndpointTokens({ storage, key: 'tok', base: 'https://app.test/x', onSet }) });

test('a token belongs to one exact destination', () => {
  const { t } = make();
  t.set('https://api.example.com/v1', ' secret ');
  assert.equal(t.get('https://api.example.com/v1'), 'secret');
  assert.equal(t.get('https://api.example.com/v1/'), 'secret');
  assert.equal(t.get('https://api.example.com/v1/chat/completions'), 'secret');
  assert.equal(t.get('https://api.example.com/v2'), '');
  assert.equal(t.get('https://api.example.com/v1?tenant=b'), '');
  assert.equal(t.get('https://other.example.com/v1'), '');
});
test('canonicalize drops the hash and the completions path, and rejects non-URLs', () => {
  const { t } = make();
  assert.equal(t.canonicalize('https://a.test/v1/chat/completions#x'), 'https://a.test/v1');
  assert.equal(t.canonicalize('https://a.test/'), 'https://a.test');
  assert.equal(t.canonicalize(''), '');
  assert.equal(t.canonicalize('http://[bad'), '');
});
test('an empty token removes the saved one; clear removes it too', () => {
  const { t } = make();
  t.set('https://a.test', 'k'); assert.equal(t.has('https://a.test'), true);
  t.set('https://a.test', '  '); assert.equal(t.has('https://a.test'), false);
  t.set('https://a.test', 'k'); t.clear('https://a.test'); assert.equal(t.get('https://a.test'), '');
});
test('tokens persist through the storage and load back; reset forgets them in memory', () => {
  const { storage, t } = make();
  t.set('https://a.test', 'k');
  const again = createEndpointTokens({ storage, key: 'tok' }); again.load();
  assert.equal(again.get('https://a.test'), 'k');
  again.reset(); assert.equal(again.get('https://a.test'), '');
});
test('bad stored data is ignored; onSet fires before a token is saved', () => {
  const storage = memory(); storage.setItem('tok', '[1,2]');
  const seen = [];
  const t = createEndpointTokens({ storage, key: 'tok', onSet: e => seen.push(e) }); t.load();
  assert.equal(t.get('https://a.test'), '');
  t.set('https://a.test', 'k'); assert.deepEqual(seen, ['https://a.test']);
  const broken = createEndpointTokens({ storage: { getItem() { return '{'; }, setItem() {} }, key: 'tok' }); broken.load();
  assert.equal(broken.has('https://a.test'), false);
});
