// A storage backend for wllama's cache manager that keeps model files in the browser's Cache API, for browsers where OPFS (the file storage the models normally use)
// cannot be opened. Seen on an iPhone 11 Pro (iOS 18.6.2, Safari): navigator.storage.getDirectory() rejects with "UnknownError: The operation failed for an unknown
// transient reason (e.g. out of memory)" while the Cache API works. It has the interface of the vendored OPFS backend (wllama v1q): isSupported, read, write,
// getSize, list, delete. Each file is stored as a response (the bytes) plus a small size entry, so listing needs no reading of the big files. A write that does not
// finish stores nothing, so there is never a half-written file. Pure but for the CacheStorage passed in.

const ORIGIN = "https://plc-model-files.invalid/";
const SIZE = ".__size";

export function createCacheApiBackend({ cacheStorage = globalThis.caches, cacheName = "plc-model-files-v1" } = {}) {
  const urlFor = (key) => ORIGIN + encodeURIComponent(key);
  const keyOf = (url) => decodeURIComponent(url.slice(ORIGIN.length));
  const open = () => cacheStorage.open(cacheName);
  // Response.blob() loads the whole body into memory (on iOS), and the runtime re-opens the source file several times while it loads a model (progressive source release),
  // which on an iPhone 11 Pro made the page freeze. So the same Blob is handed back for the same file until forget() is called (the adapter calls it once the model is
  // loaded), and at most one file is held that way.
  let held = null; // { key, promise }
  const hold = (key) => { if (held?.key !== key) held = { key, promise: null }; return held; };
  return {
    kind: "cache-api",
    isSupported: () => Boolean(cacheStorage?.open),
    /** Let go of the Blob that read() is keeping (its memory) once nothing needs to re-open it. */
    forget() { held = null; },
    /** The file as a Blob, or null when it is not there. The same Blob again for the same file until forget(). */
    async read(key) {
      const h = hold(key);
      if (!h.promise) h.promise = (async () => { try { const r = await (await open()).match(urlFor(key)); return r ? await r.blob() : null; } catch { return null; } })();
      const blob = await h.promise;
      if (blob === null && held === h) held = null; // a miss is not remembered
      return blob;
    },
    /** Stores the stream. Nothing is kept unless the whole stream arrived. */
    async write(key, stream) {
      if (held?.key === key) held = null;
      const cache = await open();
      let size = 0;
      const counted = stream.pipeThrough(new TransformStream({ transform(chunk, controller) { size += chunk.byteLength; controller.enqueue(chunk); } }));
      await cache.delete(urlFor(key)); await cache.delete(urlFor(key) + SIZE);
      await cache.put(urlFor(key), new Response(counted, { headers: { "content-type": "application/octet-stream" } }));
      await cache.put(urlFor(key) + SIZE, new Response(String(size)));
    },
    /** Size in bytes, or -1 when it is not there. */
    async getSize(key) {
      try {
        const cache = await open();
        const s = await cache.match(urlFor(key) + SIZE);
        if (s) { const n = Number(await s.text()); if (Number.isFinite(n)) return n; }
        const r = await cache.match(urlFor(key));
        return r ? (await r.blob()).size : -1;
      } catch { return -1; }
    },
    async list() {
      const cache = await open();
      const out = [];
      for (const request of await cache.keys()) {
        if (request.url.endsWith(SIZE)) continue;
        const key = keyOf(request.url);
        const size = await this.getSize(key);
        if (size >= 0) out.push({ key, size });
      }
      return out;
    },
    async delete(key) {
      if (held?.key === key) held = null;
      const cache = await open();
      await cache.delete(urlFor(key)); await cache.delete(urlFor(key) + SIZE);
    },
  };
}
