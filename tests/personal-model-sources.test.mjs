import assert from 'node:assert/strict';
import test from 'node:test';
import { editPersonalSources, localModelSource, personalSource, runtimeSources } from '../chat/models/personal-sources.mjs';

test('personal source edits preserve order and keep the descriptor free of credentials', () => {
  const first = personalSource({ id: 'first', label: 'First', base: 'https://first.example/models', credential: true, token: 'secret' });
  assert.deepEqual(first, { id: 'first', label: 'First', base: 'https://first.example/models/', credential: true });
  const list = editPersonalSources([first], {
    kind: 'add', source: { id: 'second', label: 'Second', base: 'https://second.example/' },
  });
  const moved = editPersonalSources(list, { kind: 'move', id: 'second', direction: -1 });
  assert.deepEqual(moved.map(({ id }) => id), ['second', 'first']);
  assert.deepEqual(list.map(({ id }) => id), ['first', 'second']);
  const remaining = editPersonalSources(moved, { kind: 'remove', id: 'second' });
  assert.deepEqual(runtimeSources(remaining), [{
    id: 'first', label: 'First', base: 'https://first.example/models/',
    credentialScope: 'endpoint', credentials: 'request',
  }]);
  assert.throws(() => editPersonalSources(list, { kind: 'add', source: { ...first, id: 'third' } }), { code: 'source-duplicate' });
});

test('personal sources refuse credential-bearing addresses before storage', () => {
  for (const base of ['https://name:secret@example.test/', 'https://example.test/?token=secret', 'https://example.test/#private', 'http://remote.example/']) {
    assert.throws(() => personalSource({ id: 'mirror', label: 'Mirror', base }), { code: 'source-address' });
  }
});

test('local selections use names relative to the picked root and reject collisions', () => {
  const file = new File(['fixture'], 'model.gguf');
  const folderFile = Object.assign(new File(['folder fixture'], 'weights.bin'), {
    webkitRelativePath: 'picked/model/weights.bin',
  });
  assert.deepEqual([...localModelSource([file, folderFile]).files], [
    ['model.gguf', file], ['model/weights.bin', folderFile],
  ]);
  assert.throws(() => localModelSource([file, file]), { code:'source-file-path' });
  assert.throws(() => localModelSource([{ name:'../escape.gguf' }]), { code:'source-file-path' });
  assert.throws(() => localModelSource([]), { code:'source-file-empty' });
});
