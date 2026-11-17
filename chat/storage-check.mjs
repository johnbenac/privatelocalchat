// Can this device really hold a download? navigator.storage.estimate() cannot say: Chrome sizes the quota from TOTAL disk, and an
// Android phone with 430 MB free reported a 34 GB quota (runtime/voice-pick.mjs). So this also writes bytes+margin of random
// (incompressible) data into a temporary OPFS file, then always deletes it. writeOk is true only if the whole write AND the delete
// succeeded; any failure, including QuotaExceededError, gives false. Stale temporary files from aborted runs are removed first.

export const TEMP_PREFIX = 'plc-storage-check-';
export const CHUNK_BYTES = 4 * 1024 * 1024;
export const DEFAULT_MARGIN = 64 * 1024 * 1024;

const randomChunk = (size, cryptoObj) => {
  const buf = new Uint8Array(size);
  for (let o = 0; o < size; o += 65536) cryptoObj.getRandomValues(buf.subarray(o, Math.min(size, o + 65536))); // 64 KB per call is the API limit
  return buf;
};

async function removeStale(root) {
  try {
    const names = [];
    for await (const [name] of root.entries()) if (name.startsWith(TEMP_PREFIX)) names.push(name);
    for (const name of names) { try { await root.removeEntry(name); } catch {} }
  } catch {}
}

/**
 * @param {object} [o]
 * @param {number} o.bytes      size of the intended download
 * @param {number} [o.margin]   extra bytes that must also fit (default 64 MB)
 * @param {object} [o.storage]  navigator.storage-like {estimate(), getDirectory()}
 * @returns {Promise<{usage:number|null, quota:number|null, writeOk:boolean}>} never rejects
 */
export async function checkStorage({ bytes = 0, margin = DEFAULT_MARGIN, storage = globalThis.navigator?.storage, crypto: cryptoObj = globalThis.crypto } = {}) {
  let usage = null, quota = null;
  try { const e = await storage.estimate(); if (Number.isFinite(e?.usage)) usage = e.usage; if (Number.isFinite(e?.quota)) quota = e.quota; } catch {}
  const total = Math.max(0, Math.floor(bytes) + Math.floor(margin));
  let root;
  try { root = await storage.getDirectory(); } catch { return { usage, quota, writeOk: false }; }
  await removeStale(root);
  const name = `${TEMP_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let wrote = false, writable = null, created = false;
  try {
    const handle = await root.getFileHandle(name, { create: true });
    created = true;
    writable = await handle.createWritable();
    for (let done = 0; done < total; done += CHUNK_BYTES) await writable.write(randomChunk(Math.min(CHUNK_BYTES, total - done), cryptoObj));
    await writable.close();
    writable = null;
    wrote = true;
  } catch {
    wrote = false;
  } finally {
    if (writable) { try { await writable.abort(); } catch {} }
  }
  let deleted = !created;
  if (created) {
    try { await root.removeEntry(name); deleted = true; } catch { deleted = false; }
  }
  return { usage, quota, writeOk: wrote && deleted };
}
