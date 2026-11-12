// The four sentences that tell people what is encrypted or uploaded must name what they cover,
// not say "Everything" or "Nothing is uploaded" (the vault leaves models, voices and the offline copy plain).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const COVERED = ['chats', 'documents', 'memory', 'settings'];

function encryptionProblem(text) {
  if (/Everything/.test(text)) return 'says Everything';
  const missing = COVERED.filter((w) => !text.includes(w));
  return missing.length ? `does not name ${missing.join(', ')}` : null;
}
function uploadProblem(text) {
  if (/Nothing is uploaded/.test(text)) return 'says Nothing is uploaded';
  return /provider/.test(text) ? null : 'does not mention the provider';
}
function noteIn(file, start) {
  const src = read(file); const i = src.indexOf(start);
  assert.ok(i >= 0, `${file} still has the sentence starting "${start}"`);
  return src.slice(i, src.indexOf('\n', i));
}

const cases = [
  ['unlock screen', 'chat/vault/unlock-screen.mjs', 'Your chats, documents', 'Everything on this device is encrypted. Type your passphrase to open it.'],
  ['toast', 'chat/lock/lock.mjs', 'Your chats, documents, memory and settings are now', 'Everything is now encrypted with your passphrase.'],
  ['Security row', 'chat/lock/lock.mjs', 'Your chats, documents, memory and settings on this device', 'Everything this app saves on this device is encrypted with your passphrase.'],
  ['Settings row', 'chat/shell/shell.mjs', '"App lock and encryption"', 'row("App lock and encryption", "Ask for a passcode before the app opens, and encrypt everything this app saves on this device. Unlock with the passphrase'],
];
for (const [name, file, start, old] of cases) {
  test(`${name} names what is encrypted`, () => {
    assert.equal(encryptionProblem(noteIn(file, start)), null);
  });
  test(`${name}: the old wording fails the same check`, () => {
    assert.ok(encryptionProblem(old));
  });
}

test('documents note says passages go to an outside provider', () => {
  assert.equal(uploadProblem(noteIn('chat/documents/documents-ui.mjs', "Files added here are read")), null);
});
test('documents note: the old wording fails the same check', () => {
  const old = 'Files added here are read and kept on this device only. When you ask a question in a chat they apply to, the best-matching passages are supplied to the model and cited under its answer. Nothing is uploaded.';
  assert.ok(uploadProblem(old));
});
