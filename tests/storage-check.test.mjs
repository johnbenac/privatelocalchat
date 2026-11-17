import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStorage, TEMP_PREFIX } from '../chat/storage-check.mjs';

const MB = 1024 * 1024;
function fakeStorage({ freeBytes = Infinity, failRemove = false, stale = [], noDir = false, estimate = { usage: 5 * MB, quota: 34e9 } } = {}) {
  const files = new Map(stale.map((n) => [n, 10]));
  let used = 0;
  const root = {
    async *entries() { for (const n of [...files.keys()]) yield [n, {}]; },
    async removeEntry(n) { if (failRemove && n.startsWith(TEMP_PREFIX) && !stale.includes(n)) throw new Error('busy'); if (!files.has(n)) throw new Error('missing'); files.delete(n); },
    async getFileHandle(n) {
      files.set(n, 0);
      return { async createWritable() {
        let size = 0, open = true;
        return {
          async write(chunk) { if (size + chunk.byteLength > freeBytes) throw new DOMException('full', 'QuotaExceededError'); size += chunk.byteLength; files.set(n, size); used = Math.max(used, size); },
          async close() { open = false; },
          async abort() { open = false; }, get open() { return open; }
        };
      } };
    }
  };
  return { files, get peak() { return used; }, estimate: async () => estimate, getDirectory: async () => { if (noDir) throw new Error('no opfs'); return root; } };
}

test('success writes bytes+margin of non-compressible data and leaves nothing behind', async () => {
  const s = fakeStorage();
  const r = await checkStorage({ bytes: 10 * MB, margin: 6 * MB, storage: s });
  assert.deepEqual(r, { usage: 5 * MB, quota: 34e9, writeOk: true });
  assert.equal(s.peak, 16 * MB);
  assert.equal(s.files.size, 0);
});

test('default margin is 64 MB', async () => {
  const s = fakeStorage();
  assert.equal((await checkStorage({ bytes: 1 * MB, storage: s })).writeOk, true);
  assert.equal(s.peak, 65 * MB);
});

test('quota error midway reports writeOk false and still deletes the file', async () => {
  const s = fakeStorage({ freeBytes: 20 * MB });
  const r = await checkStorage({ bytes: 100 * MB, storage: s });
  assert.equal(r.writeOk, false);
  assert.equal(r.quota, 34e9, 'a huge reported quota does not make the write succeed');
  assert.equal(s.files.size, 0);
});

test('a failed delete means writeOk false', async () => {
  const r = await checkStorage({ bytes: MB, margin: MB, storage: fakeStorage({ failRemove: true }) });
  assert.equal(r.writeOk, false);
});

test('stale temporary files from earlier aborted runs are removed; unrelated files are kept', async () => {
  const s = fakeStorage({ stale: [TEMP_PREFIX + 'old1', TEMP_PREFIX + 'old2', 'model.gguf'] });
  const r = await checkStorage({ bytes: MB, margin: MB, storage: s });
  assert.equal(r.writeOk, true);
  assert.deepEqual([...s.files.keys()], ['model.gguf']);
});

test('no OPFS or no estimate fails safe and never throws', async () => {
  assert.equal((await checkStorage({ bytes: MB, storage: fakeStorage({ noDir: true }) })).writeOk, false);
  const r = await checkStorage({ bytes: MB, storage: { estimate: async () => { throw new Error('x'); }, getDirectory: async () => { throw new Error('y'); } } });
  assert.deepEqual(r, { usage: null, quota: null, writeOk: false });
  assert.equal((await checkStorage({ bytes: MB, storage: undefined })).writeOk, false);
});

test('chunks are 4 MB and each is fresh random data', async () => {
  const seen = [];
  const s = fakeStorage();
  const orig = s.getDirectory;
  s.getDirectory = async () => {
    const root = await orig();
    const gfh = root.getFileHandle.bind(root);
    root.getFileHandle = async (n, o) => { const h = await gfh(n, o); const cw = h.createWritable; h.createWritable = async () => { const w = await cw(); const ow = w.write; w.write = async (c) => { seen.push(c.slice()); return ow(c); }; return w; }; return h; };
    return root;
  };
  await checkStorage({ bytes: 5 * MB, margin: 3 * MB, storage: s });
  assert.deepEqual(seen.map((c) => c.byteLength), [4 * MB, 4 * MB]);
  assert.notDeepEqual(seen[0], seen[1]);
  assert.ok(new Set(seen[0].subarray(0, 4096)).size > 200, 'looks random');
});
