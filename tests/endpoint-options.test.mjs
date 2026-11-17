import test from 'node:test';
import assert from 'node:assert/strict';
import { endpointOptions, getEndpointOptionById, findEndpointOptionForValue, escapeHtml } from '../chat/provider/endpoint-options.mjs';

test('every provider has an id, a label and a hint; ids are unique', () => {
  const ids = endpointOptions.map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const o of endpointOptions) { assert.ok(o.id && o.label, o.id); assert.equal(typeof o.hint, 'string'); }
  assert.ok(ids.includes('choose') && ids.includes('custom'));
});
test('an endpoint is matched to its provider, and an unknown one is custom', () => {
  assert.equal(findEndpointOptionForValue('').id, 'choose');
  assert.equal(findEndpointOptionForValue('https://api.openai.com/v1/chat/completions').id, 'openai');
  assert.equal(findEndpointOptionForValue('http://localhost:11434/v1').id, 'ollama');
  assert.equal(findEndpointOptionForValue('https://api.anthropic.com/v1/messages').id, 'anthropic');
  assert.equal(findEndpointOptionForValue('https://api.x.ai/v1').id, 'xai');
  assert.equal(findEndpointOptionForValue('https://my.example.org/v1').id, 'custom');
  assert.equal(getEndpointOptionById('nope').id, 'choose');
});
test('escapeHtml escapes the five characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});
test('each provider names a known API format and the ones that need it say how the key is sent', () => {
  for (const o of endpointOptions) { assert.ok(!o.format || ['chat', 'responses', 'anthropic'].includes(o.format), o.id); }
  assert.equal(getEndpointOptionById('anthropic').format, 'anthropic');
  assert.equal(getEndpointOptionById('openai').format, 'responses');
  assert.equal(getEndpointOptionById('azure').authStyle, 'api-key');
  assert.equal(getEndpointOptionById('google').stripModelPrefix, 'models/');
  for (const gone of ['runpod', 'baseten', 'anyscale', 'lorax', 'huggingface-tgi']) assert.equal(getEndpointOptionById(gone).id, 'choose', gone);
});
