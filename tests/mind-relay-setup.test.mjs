// SPDX-License-Identifier: AGPL-3.0-only
// What the setup asks for and says when the mind is reached through a relay (chat/mind/mind-setup.mjs): the fields it validates, the token that is returned but is not part of what the chat
// keeps, and the plain sentence for every answer of Check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, describeRelayCheck } from '../chat/mind/mind-setup.mjs';
import { nameOf, RELAY_DEFAULT_NAME, DEFAULT_NAME } from '../chat/mind/mind-model.mjs';

const good = { via: 'relay', relayAddress: 'https://relay.example', channel: 'chan-test-0001', token: ' tok ', resident: 'r', encounter: 'e', participant: 'p' };

test('a relay configuration needs an address, a channel, a token (or a saved one), and the three ids', () => {
  const v = validateConfig(good);
  assert.equal(v.ok, true); assert.equal(v.config.via, 'relay'); assert.equal(v.config.address, 'https://relay.example'); assert.equal(v.config.channel, 'chan-test-0001'); assert.equal(v.config.token, 'tok');
  assert.equal(v.config.name, RELAY_DEFAULT_NAME, 'the neutral default name does not say "on this computer"');
  assert.deepEqual(validateConfig({ ...good, relayAddress: 'ftp://x' }).problems, ['relayAddress']);
  assert.deepEqual(validateConfig({ ...good, relayAddress: 'http://relay.example' }).problems, ['relayAddress'], 'plain http only on this computer');
  assert.deepEqual(validateConfig({ ...good, channel: 'x' }).problems, ['channel']);
  assert.deepEqual(validateConfig({ ...good, token: '' }).problems, ['token']);
  assert.equal(validateConfig({ ...good, token: '' }, { hasToken: true }).ok, true, 'an empty token keeps the saved one');
  assert.deepEqual(validateConfig({ ...good, resident: '', participant: '' }).problems, ['resident', 'participant']);
});

test('the computer configuration is unchanged: no via, no channel, no token', () => {
  const v = validateConfig({ address: 'http://127.0.0.1:1', resident: 'r', encounter: 'e', participant: 'p' });
  assert.equal(v.ok, true); assert.equal('via' in v.config, false); assert.equal('token' in v.config, false); assert.equal(v.config.name, DEFAULT_NAME);
});

test('nameOf: a configured name, else the neutral name for the way the mind is reached', () => {
  assert.equal(nameOf({ name: 'Ada', via: 'relay' }), 'Ada'); assert.equal(nameOf({ via: 'relay' }), 'a mind'); assert.equal(nameOf({}), 'a mind on this computer');
});

test('Check says what the relay answered, never claims more, and always says nothing was sent', () => {
  const say = (kind) => describeRelayCheck({ kind }, 'https://relay.example').sentence;
  assert.equal(say('available'), 'The relay answered and the mind is connected to it. Nothing was sent.');
  assert.equal(say('unavailable'), 'The relay answered, but the mind is not connected to it right now. Nothing was sent.');
  assert.equal(say('insecure'), 'Could not connect securely. The browser does not say why. Nothing was sent.');
  assert.equal(say('revoked'), 'You are not allowed to use this connection any more. Nothing was sent.');
  assert.equal(say('superseded'), 'This conversation was opened in another tab while checking. Nothing was sent.');
  assert.equal(say('no-token'), 'Add your access token first. Nothing was sent.');
  assert.match(say('unreachable'), /^No answer from the relay at relay\.example\. Nothing was sent\./);
  assert.ok(!/this computer/i.test(['available', 'unavailable', 'insecure', 'revoked', 'superseded', 'no-token', 'unreachable'].map(say).join(' ')));
});
