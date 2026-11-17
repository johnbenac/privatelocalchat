// Are the small matching model's files already saved in this browser? The embedding worker keeps them in the browser's Cache API (see embedder.mjs), under the
// model's address, so a check of that cache answers without loading anything. Returns true, false, or null when this browser cannot say.
import { EMBEDDING_MODEL_BASE } from "./embedding-config.mjs";

export async function embeddingSaved(cacheStorage = globalThis.caches, base = EMBEDDING_MODEL_BASE) {
  if (!cacheStorage?.keys) return null;
  try {
    for (const name of await cacheStorage.keys()) {
      const cache = await cacheStorage.open(name);
      for (const request of await cache.keys()) if (request.url.startsWith(base) && /\.onnx(\?|$)/.test(request.url)) return true;
    }
    return false;
  } catch { return null; }
}
