// The SHIPPED catalogue as manifests, built at run time from the catalogue data the package already carries (catalog-tiers.mjs). This is the only manifest module that imports that data, so a
// consumer with its own catalogue (runtime.mjs) never loads it: shipped.mjs is the entry that does. No second copy of the pins is shipped.
import { TIERS, VARIANT_INFO, WEBLLM_VARIANTS, W, L, LFM, GRANITE, MINI, NANO, LICENCE_TEXTS } from "./catalog-tiers.mjs";
import { manifestFromDescriptor, rightsForLicence, mediaOf, slug } from "./manifest-view.mjs";

function roleOf(name, engine) {
  if (name.endsWith(".wasm") && engine === "webllm") return "runtime";
  if (/\.gguf$/i.test(name) || /^params_shard_\d+\.bin$/.test(name)) return "weights";
  if (name === "mlc-chat-config.json") return "config";
  if (name === "ndarray-cache.json") return "index";
  if (/^tokenizer|vocab|merges/i.test(name)) return "tokenizer";
  return "support";
}
const scopeOf = (name, engine) => engine === "webllm" ? (name.endsWith(".wasm") ? "webllm/wasm" : name === "mlc-chat-config.json" ? "webllm/config" : "webllm/model") : "opfs";

function manifestOf({ tierKey, info, id, revision, files, engine, runtime, needs }, closureHash, descriptorFormat, wllamaRuntime) {
  const artifacts = files.map((f) => ({ role: roleOf(f.path, engine), sha256: f.sha256, bytes: f.bytes, mediaType: mediaOf(f.path), name: f.path }));
  const text = LICENCE_TEXTS[tierKey]; if (text) artifacts.push({ role: "licence", sha256: text.sha256, bytes: text.bytes, mediaType: "text/plain", name: "LICENSE.txt" });   // travels with a bundle; an install does not fetch it
  const rights = rightsForLicence(info.license);
  const descriptor = {
    ...(descriptorFormat ? { format: descriptorFormat } : {}),   // the contract's format id comes from the contract (tools pass it in); no shipped file names the programme
    resource: { id, kind: "inert", class: "model-resource", revision, label: info.label },
    artifacts,
    runtime,
    requires: [
      { profile: "provisional/cap/webgpu", version: "1", need: needs.webgpu ? "required" : "optional" },
      ...(needs.opfs ? [{ profile: "provisional/cap/opfs-storage", version: "1", need: "required" }] : [])
    ],
    rights,
    // a wllama model is not runnable without its runtime build: digest-pinned, executable, required (T783 dependencies); the closure of the whole bundle is the model plus this runtime
    ...(engine === "wllama" && wllamaRuntime ? { dependencies: wllamaRuntime.descriptor.artifacts.map((a) => ({ id: wllamaRuntime.descriptor.resource.id, revision: wllamaRuntime.descriptor.resource.revision, role: a.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]/g, "-"), sha256: a.sha256, bytes: a.bytes, kind: "executable", need: "required", name: a.name })) } : {}),
    crosswalk: [{ system: "runtime-manifest", ref: "catalog-data.mjs files[].bytes + sha256", correspondence: "exact" }]
  };
  const m = manifestFromDescriptor(descriptor, {
    engine, scopeOf: (a) => scopeOf(a.name, engine), closureHash, note: info.licenseNote,
    needs: { shaderF16: needs.shaderF16, threadsBasis: needs.threadsBasis, steadyBytes: info.memory.steadyBytes, peakBytes: info.memory.peakBytes, memoryBasis: /measured/.test(info.memory.note ?? "") && !/estimate/.test(info.memory.note ?? "") ? "measured" : "estimate" },
    io: { inputs: [{ kind: "text" }], outputs: [{ kind: "text" }] }
  });
  if (engine === "wllama" && wllamaRuntime) m.view.runtime = { id: wllamaRuntime.descriptor.resource.id, revision: wllamaRuntime.descriptor.resource.revision, ...(wllamaRuntime.view.closure ? { closure: wllamaRuntime.view.closure } : {}) };
  return { tierKey, ...m };
}

/** All manifests of the shipped catalogue, keyed by manifest id: the default model's two builds and the five wllama models. */
export function shippedManifests({ closureHash = null, descriptorFormat = null, wllamaRuntime = null } = {}) {
  const out = [];
  for (const v of WEBLLM_VARIANTS) {
    const D = W[v]; const info = { ...TIERS.default, memory: VARIANT_INFO[v].memory };
    out.push(manifestOf({ tierKey: "default", info, id: "resource:model/" + slug(D.repo.split("/").pop()), revision: D.commit,
      files: [...D.files, D.lib], engine: "webllm", runtime: { engine: "webllm", version: TIERS.default.runtime.version },
      needs: { webgpu: true, shaderF16: v === "q4f16_1", opfs: false, threadsBasis: "WebGPU engine: no threads" } }, closureHash, descriptorFormat));
    out.at(-1).variant = v;
  }
  const wl = { light: L, lfm: LFM, granite: GRANITE, mini: MINI, nano: NANO };
  for (const [key, D] of Object.entries(wl)) {
    const info = TIERS[key];
    out.push(manifestOf({ tierKey: key, info, id: "resource:model/" + slug(info.modelId), revision: D.sourceRevision,
      files: D.files, engine: "wllama", runtime: { engine: "wllama", version: info.runtime.version },
      needs: { webgpu: false, shaderF16: false, opfs: !info.tiny, threadsBasis: "single-thread compat build (the load config names runtime class compat)" } }, closureHash, descriptorFormat, wllamaRuntime));
  }
  return out;
}


