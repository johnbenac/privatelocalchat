// The package's default registry (webllm, wllama, mock) over the engine registry. A consumer that registers only its own engines imports ./engine-registry.mjs instead and ships no adapter it does not use.
import { createEngineRegistry } from "./engine-registry.mjs";
export { createEngineRegistry, ENGINE_KINDS } from "./engine-registry.mjs";

/** The package's own three engines, exactly as the Worker entry has always had them. */
export function defaultRegistry() {
  return createEngineRegistry()
    .register("mock", { kind: "language", load: () => import("./adapters/mock.mjs"), adapterExport: "MockAdapter", license: "AGPL-3.0-only" })
    .register("wllama", { kind: "language", load: () => import("./adapters/wllama.mjs"), adapterExport: "WllamaAdapter", license: "MIT" })
    .register("webllm", { kind: "language", load: () => import("./adapters/webllm.mjs"), adapterExport: "WebLlmAdapter", license: "Apache-2.0" });
}

