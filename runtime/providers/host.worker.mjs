// Module Worker entry: the ONE inference host for the page. Hosts host-core with the package's own engines (webllm, wllama, mock).
// Provenance: productionised from spikes/llm/provider/host.worker.js (FAB-02). The entry is now `startHostWorker` (worker-entry.mjs) over the
// default engine registry (registry.mjs), so a consumer with its own engines ships a three-line entry of its own instead of a copy of this one.
// Adapters and storage modules are imported lazily so a page that only uses one engine never fetches the other's bundle (the WebLLM bundle is
// 6.8 MB, wllama 0.4 MB + 22 MB wasm).
import { defaultRegistry } from "./registry-core.mjs";
import { startHostWorker } from "./worker-entry.mjs";

// the page asks for the release behaviour by appending ?diagnostics=0 to this Worker's address (createModelHost does when its diagnostics option is false)
startHostWorker(defaultRegistry(), { diagnostics: new URL(import.meta.url).searchParams.get("diagnostics") !== "0" });
