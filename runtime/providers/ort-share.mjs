// One copy of the ONNX Runtime Web bytes (T1068). Every ONNX-based engine says which runtime files it needs ({name, url, bytes, sha256, version}); this registry fetches each DISTINCT file once through the
// same size and SHA-256 check as every other download, keeps it in the Cache API under its digest, and hands every engine the same cached address. Two engines that name the same bytes share one cache entry;
// two that name DIFFERENT bytes (a different ONNX Runtime Web version or build) get two copies and the report says so: sharing never hides a version difference.
//
// Instances are not shared across Workers: every latency group (speech-out, speech-in, embedding ...) is its own Worker with its own instance, because two sessions in one Worker would serialise.
import { fetchVerified, candidatesFor } from "./sources-core.mjs";

export function createOrtShare({ cacheStorage = globalThis.caches, cacheName = "model-runtime-ort-v1", fetch: fetchFn = (...a) => globalThis.fetch(...a), hash, sourceList = [], fallback = true, requestCredential = null, addressOf = null } = {}) {
  // the cache key of a stored runtime file: an address on this page's own origin (the Cache API accepts only http(s) keys), never a host of anyone else's; a Worker or page has location, a test passes addressOf
  const keyOf = addressOf ?? ((sha256, name) => { if (!globalThis.location?.origin) throw new TypeError("ort-share needs addressOf when there is no page origin"); return `${globalThis.location.origin}/__ort-share__/${sha256}/${name}`; });
  const fetchedOnce = new Map();    // sha256 -> Promise<address>
  const copies = new Map();         // sha256 -> {name, bytes, version, engines:Set}
  let downloads = 0;
  const byId = new Map(sourceList.map((s) => [s.id, s]));

  async function ensureFile(f) {
    if (!fetchedOnce.has(f.sha256)) fetchedOnce.set(f.sha256, (async () => {
      const cache = await cacheStorage.open(cacheName); const address = keyOf(f.sha256, f.name);
      const have = await cache.match(new Request(address));
      if (have && (await have.clone().arrayBuffer()).byteLength === f.bytes) return address;   // already stored (another page load, another engine)
      downloads++;
      const r = await fetchVerified({ path: f.name, bytes: f.bytes, sha256: f.sha256, url: f.url, rel: f.rel ?? null }, candidatesFor({ url: f.url, rel: f.rel ?? null, path: f.name }, { sources: sourceList, fallback }), { fetch: fetchFn, requestCredential }, { hash, sourcesById: byId });
      await cache.put(new Request(address), new Response(r.blob, { status: 200, headers: { "content-length": String(f.bytes), "content-type": f.name.endsWith(".wasm") ? "application/wasm" : "text/javascript" } }));
      return address;
    })().catch((e) => { fetchedOnce.delete(f.sha256); throw e; }));
    return fetchedOnce.get(f.sha256);
  }

  return {
    /** The shared addresses for an engine's runtime files, fetched and verified at most once per distinct digest. */
    async acquire(engineId, files) {
      const addresses = {};
      for (const f of files) {
        if (!/^[0-9a-f]{64}$/.test(f.sha256 ?? "") || !Number.isSafeInteger(f.bytes)) throw Object.assign(new TypeError(`ONNX runtime file ${f.name} needs a sha256 and a size`), { code: "unpinned-runtime-file" });
        addresses[f.name] = await ensureFile(f);
        const c = copies.get(f.sha256) ?? { name: f.name, bytes: f.bytes, version: f.version ?? null, engines: new Set() }; c.engines.add(engineId); copies.set(f.sha256, c);
      }
      return addresses;
    },
    release(engineId) { for (const c of copies.values()) c.engines.delete(engineId); },
    /** How many distinct copies are in use and by whom: more than one copy of the same file name with different digests is a version difference, reported as such. */
    report() {
      const list = [...copies].map(([sha256, c]) => ({ sha256, name: c.name, bytes: c.bytes, version: c.version, engines: [...c.engines].sort() })).sort((a, b) => (a.name + a.sha256 < b.name + b.sha256 ? -1 : 1));
      const names = new Map(); for (const c of list) names.set(c.name, (names.get(c.name) ?? 0) + 1);
      return { downloads, copies: list, distinctFiles: list.length, versionDifferences: [...names].filter(([, n]) => n > 1).map(([name]) => name) };
    }
  };
}
