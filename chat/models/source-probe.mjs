import { legacyCatalog, OFFICIAL_SOURCES } from "../../runtime/providers/catalog.mjs";
import { candidatesFor, fetchVerified, normalizeSources } from "../../runtime/providers/sources-core.mjs";
import { runtimeSources } from "./personal-sources.mjs";

export async function probeModelSource(source, { posture, requestCredential, signal, fetcher = fetch }) {
  const catalog = legacyCatalog();
  const pinned = catalog.tierFiles("default", OFFICIAL_SOURCES).find(({ path }) => path === "mlc-chat-config.json");
  const file = { ...pinned, rel: catalog.relFor("default", pinned) };
  const sources = normalizeSources(runtimeSources([source]));
  const [entry] = sources;
  const range = `bytes=0-${file.bytes - 1}`;
  const contentRange = `bytes 0-${file.bytes - 1}/${file.bytes}`;
  const checked = await fetchVerified(file, candidatesFor(file, { sources, fallback:false }), {
    requestCredential,
    async fetch(url, options) {
      const headers = new Headers(options.headers);
      headers.set("Range", range);
      const response = await fetcher(url, { ...options, headers, mode:"cors" });
      if (response.status !== 206 || response.headers.get("Content-Range") !== contentRange) {
        await response.body?.cancel();
        throw Object.assign(new Error("The source must return a matching partial response and expose Content-Range."), { code:"source-range" });
      }
      if (!response.body) throw Object.assign(new Error("The source returned an empty response."), { code:"source-range" });
      let bytes = 0;
      const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > file.bytes) controller.error(Object.assign(new Error("The source exceeded the pinned size."), { code:"cache-corrupt" }));
          else controller.enqueue(chunk);
        },
      }));
      return new Response(body, { status:response.status, headers:response.headers });
    },
  }, {
    signal,
    sourcesById: new Map([[entry.id, entry]]),
    posture: { refused: posture.mode === "curated" && !posture.approve(entry.base) ? [entry.id] : [] },
    async hash(blob) {
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    },
  });
  return { bytes:checked.blob.size, sha256:file.sha256, source:checked.servedBy };
}
