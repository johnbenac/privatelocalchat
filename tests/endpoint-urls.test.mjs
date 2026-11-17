import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveModelsUrl, deriveChatCompletionsUrl, deriveResponsesUrl, deriveMessagesUrl, parseModelIds } from '../chat/provider/endpoint-urls.mjs';

test('models url: after the version segment, query and hash dropped', () => {
  assert.equal(deriveModelsUrl('https://api.test/v1'), 'https://api.test/v1/models');
  assert.equal(deriveModelsUrl('https://api.test/v1/chat/completions?x=1#h'), 'https://api.test/v1/models');
  assert.equal(deriveModelsUrl('https://api.test/openai/v2/foo'), 'https://api.test/openai/v2/models');
  assert.equal(deriveModelsUrl('https://api.test/api'), 'https://api.test/api/models');
  assert.equal(deriveModelsUrl('https://api.test/v1/models?a=b'), 'https://api.test/v1/models');
});
test('relative endpoints resolve against the base', () => {
  assert.equal(deriveModelsUrl('/v1', 'https://app.test/page'), 'https://app.test/v1/models');
  assert.equal(deriveChatCompletionsUrl('/v1', 'https://app.test/page'), 'https://app.test/v1/chat/completions');
});
test('chat completions url has exactly one suffix', () => {
  assert.equal(deriveChatCompletionsUrl('https://api.test/v1'), 'https://api.test/v1/chat/completions');
  assert.equal(deriveChatCompletionsUrl('https://api.test/v1/chat/completions?q=1'), 'https://api.test/v1/chat/completions');
  assert.equal(deriveChatCompletionsUrl('https://api.test/chat/completions/v1'), 'https://api.test/v1/chat/completions');
});
test('model ids come from data[] or models[], as strings or objects', () => {
  assert.deepEqual(parseModelIds({ data: [{ id: ' a ' }, { name: 'b' }, 'c', {}, 3] }), ['a', 'b', 'c']);
  assert.deepEqual(parseModelIds({ models: ['x'] }), ['x']);
  assert.deepEqual(parseModelIds(null), []);
  assert.deepEqual(parseModelIds({ data: 'nope' }), []);
});
test('responses and messages urls replace whichever action the address ended with', () => {
  assert.equal(deriveResponsesUrl('https://api.test/v1'), 'https://api.test/v1/responses');
  assert.equal(deriveResponsesUrl('https://api.test/v1/chat/completions'), 'https://api.test/v1/responses');
  assert.equal(deriveMessagesUrl('https://api.anthropic.com/v1'), 'https://api.anthropic.com/v1/messages');
  assert.equal(deriveMessagesUrl('https://api.anthropic.com/v1/messages?x=1'), 'https://api.anthropic.com/v1/messages');
  assert.equal(deriveChatCompletionsUrl('https://api.test/v1/responses'), 'https://api.test/v1/chat/completions');
});
test('a provider prefix such as models/ is stripped from model ids', () => {
  assert.deepEqual(parseModelIds({ data: [{ id: 'models/a' }, { id: 'b' }] }, { stripPrefix: 'models/' }), ['a', 'b']);
});
