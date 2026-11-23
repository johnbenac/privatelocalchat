// The model catalogue: two tiers, their official sources, licences, sizes and the exact files each one is made of.
// Decision row 65 (plan/DECISIONS.md): default = WebLLM + Qwen3.5-9B (q4f16_1 where the GPU has shader-f16, q4f32_1 where it does not,
// chosen by the capability probe, not by device class); light = wllama retained-v1q + Qwen3.5-2B Q4_0. No other model is offered.
//
// Where the files come from is the configured model source (runtime/providers/app-config.mjs, docs/APP-CONFIG.md): a root that holds <name>/<revision>/<files>. A test may point a tier at another
// origin with `resolveSources(overrides)`: that is an explicit, visible setting (the manager shows "source: override <origin>"), never a fallback. Every file is checked against the pin here.
import { CATALOG_DATA } from "./catalog-data.mjs";
import { webllmLoadConfig, wllamaLoadConfig, QWEN35_EXTRA_CONTEXT } from "./engine-config.mjs";

/** The runtime build id of the original catalogue's wllama tiers: part of THIS catalogue's data (another catalogue states its own). */
export const LEGACY_WLLAMA_BUILD_ID = "privatelocalchat-native-destroy-20261030-v1";

const MiB = 1 << 20;
export const W = CATALOG_DATA.webllmQwen35_9b;
export const L = CATALOG_DATA.wllamaQwen35_2b;
export const LFM = CATALOG_DATA.wllamaLfm25_2_6b;
export const GRANITE = CATALOG_DATA.wllamaGranite40h1b;
export const MINI = CATALOG_DATA.wllamaGranite40h350m;
export const NANO = CATALOG_DATA.wllamaSmolLM2_135m;
export const WLLAMA_DATA = Object.freeze({ light: L, lfm: LFM, granite: GRANITE, mini: MINI, nano: NANO });
/** Tiers served by the wllama engine (llama.cpp in WebAssembly): they share the runtime, the OPFS cache and the processor fallback. */
export const WLLAMA_TIERS = Object.freeze(["light", "lfm", "granite", "mini", "nano"]);
/** The tiny models (a few hundred megabytes in memory at most): small enough for a phone with little free storage, and for iPhone and iPad on the processor. */
export const TINY_TIERS = Object.freeze(["mini", "nano"]);
export const isTinyTier = (t) => TINY_TIERS.includes(t);
export const isWllamaTier = (t) => WLLAMA_TIERS.includes(t);

/** The WebLLM builds of the default model. f16 is preferred; f32 exists for GPUs without shader-f16. */
export const WEBLLM_VARIANTS = Object.freeze(["q4f16_1", "q4f32_1"]);
export const DEFAULT_VARIANT = "q4f16_1";

const f16Bytes = W.q4f16_1.files.reduce((n, f) => n + f.bytes, 0) + W.q4f16_1.lib.bytes;
const f32Bytes = W.q4f32_1.files.reduce((n, f) => n + f.bytes, 0) + W.q4f32_1.lib.bytes;

export const VARIANT_INFO = Object.freeze({
  q4f16_1: Object.freeze({ variant: "q4f16_1", modelId: "Qwen3.5-9B-q4f16_1-MLC", quantization: "q4f16_1", needsF16: true, downloadBytes: f16Bytes, memory: { steadyBytes: 6.4e9, peakBytes: 9.0e9, note: "WebLLM's own vram_required_MB 6433 for this build; steady and peak here are estimates until measured on the Mac" } }),
  q4f32_1: Object.freeze({ variant: "q4f32_1", modelId: "Qwen3.5-9B-q4f32_1-MLC", quantization: "q4f32_1", needsF16: false, downloadBytes: f32Bytes, memory: { steadyBytes: 7.5e9, peakBytes: 10.5e9, note: "WebLLM's own vram_required_MB 7545 for this build; steady and peak here are estimates until measured on the Mac" } })
});

export const TIERS = Object.freeze({
  default: Object.freeze({
    tier: "default", label: "Qwen3.5-9B (quality)", engine: "webllm", adapter: "webllm",
    modelId: VARIANT_INFO[DEFAULT_VARIANT].modelId, family: "Qwen3.5", paramsB: 9, quantization: DEFAULT_VARIANT,
    license: "Apache-2.0", licenseNote: "Base model Qwen/Qwen3.5-9B (Apache-2.0). The MLC repack's own card carries no licence field.",
    runtime: { name: "web-llm", version: "0.2.86", license: "Apache-2.0" },
    contextWindowTokens: 4096, maxOutputTokens: 1024,
    structured: { "json-schema": "grammar" },
    downloadBytes: VARIANT_INFO[DEFAULT_VARIANT].downloadBytes,
    memory: VARIANT_INFO[DEFAULT_VARIANT].memory,
    speed: { decodeTokPerSec: "not yet measured", bodyStepSeconds: "not yet measured", chatTurnFirstTokenSeconds: "not yet measured", loadSecondsWarm: "not yet measured" },
    strengths: "The owner's default (DECISIONS 65). It thinks by default; the app turns thinking off for ordinary replies. Judge its behaviour by reading it.",
    cacheKind: "Cache API (webllm/model, webllm/config, webllm/wasm)"
  }),
  light: Object.freeze({
    tier: "light", label: "Qwen3.5-2B (light)", engine: "wllama", adapter: "wllama",
    modelId: "qwen3.5-2b-q4_0", family: "Qwen3.5", paramsB: 2.0, quantization: "Q4_0",
    license: "Apache-2.0", licenseNote: "Qwen/Qwen3.5-2B (Apache-2.0), quantised by the owner's pinned toolchain.",
    runtime: { name: "wllama", version: "3.5.1 retained-v1q-chat-stable-slim-20260901", license: "owner build of llama.cpp (MIT) via wllama (MIT)" },
    contextWindowTokens: 4096, maxOutputTokens: 1024,
    structured: { "json-schema": "validated" },
    downloadBytes: L.totalBytes,
    memory: { steadyBytes: 2.3e9, peakBytes: 2.8e9, note: "about 2.3 GB resident (measured)" },
    speed: { decodeTokPerSec: "about 30", bodyStepSeconds: "about 4.4", chatTurnFirstTokenSeconds: "about 1.7", loadSecondsWarm: 5 },
    strengths: "Small and quick to load. Cautions: it is NOT grammar constrained (the reply is checked after it is written and a bad one fails the attempt), it picked an offer in every one of 10 'nothing fits' trials, and its prose is weaker.",
    cacheKind: "OPFS (wllama cache directory)"
  }),
  lfm: Object.freeze({
    tier: "lfm", label: "LFM2.5-2.6B (Liquid)", engine: "wllama", adapter: "wllama",
    modelId: "lfm2.5-2.6b-q3_k_m", family: "LFM2.5", paramsB: 2.6, quantization: "Q3_K_M",
    license: "LFM Open License v1.0", licenseNote: "LiquidAI/LFM2.5-2.6B, free for use below the licence's revenue threshold; quantised by the owner's pinned toolchain. The licence text is served beside the files.",
    runtime: { name: "wllama", version: "3.5.1 retained-v1q-chat-stable-slim-20260901", license: "owner build of llama.cpp (MIT) via wllama (MIT)" },
    contextWindowTokens: 8192, maxOutputTokens: 1024,
    structured: { "json-schema": "validated" },
    downloadBytes: LFM.totalBytes,
    memory: { steadyBytes: 2.2e9, peakBytes: 2.9e9, note: "estimate from the file size plus context; see docs/CHAT-FEATURES.md for what was measured" },
    sampling: { temperature: 0.3, topP: 0.9, topK: 40, repetitionPenalty: 1.05 },
    speed: { decodeTokPerSec: "about 1.3 on a processor with no GPU (measured 2026-11-02, single thread); GPU not measured", bodyStepSeconds: "not yet measured", chatTurnFirstTokenSeconds: "about 15 for the first turn on a processor", loadSecondsWarm: 7 },
    strengths: "A stronger writer and reasoner than the 2B Qwen at a similar size, with a hybrid design that keeps memory low for long chats. Q3 quantisation trades a little accuracy for size.",
    cacheKind: "OPFS (wllama cache directory)"
  }),
  granite: Object.freeze({
    tier: "granite", label: "Granite 4.0 H 1B (IBM)", engine: "wllama", adapter: "wllama",
    modelId: "granite-4.0-h-1b-q4_k_m", family: "Granite 4.0", paramsB: 1.5, quantization: "Q4_K_M",
    license: "Apache-2.0", licenseNote: "ibm-granite/granite-4.0-h-1b (Apache-2.0), quantised by the owner's pinned toolchain; text only.",
    runtime: { name: "wllama", version: "3.5.1 retained-v1q-chat-stable-slim-20260901", license: "owner build of llama.cpp (MIT) via wllama (MIT)" },
    contextWindowTokens: 8192, maxOutputTokens: 1024,
    structured: { "json-schema": "validated" },
    downloadBytes: GRANITE.totalBytes,
    memory: { steadyBytes: 1.5e9, peakBytes: 2.0e9, note: "estimate from the file size plus context; see docs/CHAT-FEATURES.md for what was measured" },
    sampling: { temperature: 0.2, topP: 0.9, topK: 40, repetitionPenalty: 1.05 },
    speed: { decodeTokPerSec: "about 3 on a processor with no GPU (measured 2026-11-02, single thread); GPU not measured", bodyStepSeconds: "not yet measured", chatTurnFirstTokenSeconds: "about 9 for the first turn on a processor", loadSecondsWarm: 7 },
    strengths: "The smallest download here, quick on modest devices, and a hybrid (Mamba) design that is gentle on memory. Best for short, direct answers; weaker at open-ended writing.",
    cacheKind: "OPFS (wllama cache directory)"
  }),
  mini: Object.freeze({
    tier: "mini", label: "Granite 4.0 H 350M (IBM, tiny)", engine: "wllama", adapter: "wllama", tiny: true,
    modelId: "granite-4.0-h-350m-q4_k_m", family: "Granite 4.0", paramsB: 0.35, quantization: "Q4_K_M",
    license: "Apache-2.0", licenseNote: "ibm-granite/granite-4.0-h-350m (Apache-2.0), IBM's own Q4_K_M GGUF, published unchanged; text only.",
    runtime: { name: "wllama", version: "3.5.1 retained-v1q-chat-stable-slim-20260901", license: "owner build of llama.cpp (MIT) via wllama (MIT)" },
    contextWindowTokens: 4096, maxOutputTokens: 512,
    structured: { "json-schema": "validated" },
    downloadBytes: MINI.totalBytes,
    memory: { steadyBytes: 0.6e9, peakBytes: 0.9e9, note: "estimate from the file size plus context; measured values are in docs/SMALL-MODELS-PLAN.md" },
    sampling: { temperature: 0.2, topP: 0.9, topK: 40, repetitionPenalty: 1.05 },
    speed: { decodeTokPerSec: "about 12 on a desktop processor and about 21 on an iPhone 15 Pro processor (measured 2026-11-03, single thread); a Galaxy S8+ answered a short follow-up in about 12 s", bodyStepSeconds: "not yet measured", chatTurnFirstTokenSeconds: "about 2 on an iPhone 15 Pro processor", loadSecondsWarm: 2 },
    strengths: "The best small model here for its size: short, direct, correct answers, and a download under a quarter of a gigabyte. A hybrid (Mamba) design that is gentle on memory. It will not write long essays or reason through hard problems; it is for quick questions and short replies on a phone.",
    cacheKind: "OPFS (wllama cache directory)"
  }),
  nano: Object.freeze({
    tier: "nano", label: "SmolLM2-135M (tiny)", engine: "wllama", adapter: "wllama", tiny: true,
    modelId: "smollm2-135m-instruct-q4_k_m", family: "SmolLM2", paramsB: 0.135, quantization: "Q4_K_M",
    license: "Apache-2.0", licenseNote: "HuggingFaceTB/SmolLM2-135M-Instruct (Apache-2.0), Q4_K_M GGUF by bartowski, published unchanged; text only.",
    runtime: { name: "wllama", version: "3.5.1 retained-v1q-chat-stable-slim-20260901", license: "owner build of llama.cpp (MIT) via wllama (MIT)" },
    contextWindowTokens: 4096, maxOutputTokens: 512,
    structured: { "json-schema": "validated" },
    downloadBytes: NANO.totalBytes,
    memory: { steadyBytes: 0.35e9, peakBytes: 0.55e9, note: "estimate from the file size plus context; measured values are in docs/SMALL-MODELS-PLAN.md" },
    sampling: { temperature: 0.2, topP: 0.9, topK: 40, repetitionPenalty: 1.1 },
    speed: { decodeTokPerSec: "about 10 on a desktop processor and about 32 on an iPhone 15 Pro processor (measured 2026-11-03, single thread)", bodyStepSeconds: "not yet measured", chatTurnFirstTokenSeconds: "about 2.5 on an iPhone 15 Pro processor", loadSecondsWarm: 1 },
    strengths: "The smallest download here (about 105 MB) and fast on any phone. It answers simple questions and follows short instructions, but it is wordy, makes mistakes and forgets easily: use it when storage or memory is the limit, and check what it says.",
    cacheKind: "OPFS (wllama cache directory)"
  })
});

export const TIER_ORDER = Object.freeze(["default", "light", "lfm", "granite", "mini", "nano"]);

/** The build of the default model for a GPU: f16 where shader-f16 exists, else f32. Capability decides (DEC 57). null: no WebGPU. */
export function chooseWebllmVariant(env) {
  if (!env?.webgpu?.available) return null;
  return env.webgpu.shaderF16 ? "q4f16_1" : "q4f32_1";
}

/** The files that make up a tier (for the default tier, one build of it), with the URL each is fetched from, the cache scope and expected size/hash. */
export function tierFiles(tier, sources, variant = DEFAULT_VARIANT) {
  if (tier === "default") {
    const V = W[variant]; if (!V) throw new RangeError(`unknown WebLLM build ${variant}`);
    const files = V.files.map((f) => ({
      path: f.path, bytes: f.bytes, sha256: f.sha256, url: sources.webllmModelBase[variant] + f.path,
      scope: f.path === "mlc-chat-config.json" ? "webllm/config" : "webllm/model"
    }));
    files.push({ path: V.lib.path, bytes: V.lib.bytes, sha256: V.lib.sha256, url: sources.webllmLibBase[variant] + V.lib.path, scope: "webllm/wasm" });
    return files;
  }
  if (isWllamaTier(tier)) {
    const base = tier === "light" ? sources.wllamaModelBase : sources.wllamaTierBase[tier];
    return WLLAMA_DATA[tier].files.map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256, url: base + f.path, scope: "opfs" }));
  }
  throw new RangeError(`unknown tier ${tier}`);
}

/** The `load` config the host Worker's adapters take. `runtimeDir` is where the app serves the vendored wllama build (same origin). */
export function loadConfigFor(tier, { sources, runtimeDir = null, variant = DEFAULT_VARIANT, backend = "gpu" } = {}) {
  const t = TIERS[tier];
  if (!t) throw new RangeError(`unknown tier ${tier}`);
  if (tier === "default") {
    const vi = VARIANT_INFO[variant]; if (!vi) throw new RangeError(`unknown WebLLM build ${variant}`);
    return webllmLoadConfig({ tier, variant, variantInfo: vi, info: t, files: tierFiles("default", sources, variant), modelBase: sources.webllmModelBase[variant], modelLib: sources.webllmLibBase[variant] + W[variant].lib.path });
  }
  return wllamaLoadConfig({ tier, info: t, files: tierFiles(tier, sources), runtimeDir, backend, buildId: LEGACY_WLLAMA_BUILD_ID, extraContext: tier === "light" ? QWEN35_EXTRA_CONTEXT : {} });
}

/** The official sources for a model root and the directory the app serves its compiled WebLLM libraries from: the same layout catalog.mjs builds from the page's configuration. */
export function officialSourcesFor(root, webllmLibDir) {
  const webllmDir = (v) => root + W[v].repo.split("/").pop() + "/resolve/" + W[v].commit + "/";
  return Object.freeze({
    webllmModelBase: Object.freeze(Object.fromEntries(WEBLLM_VARIANTS.map((v) => [v, webllmDir(v)]))),
    webllmLibBase: Object.freeze(Object.fromEntries(WEBLLM_VARIANTS.map((v) => [v, webllmLibDir]))),
    wllamaModelBase: root + L.dir,
    wllamaTierBase: Object.freeze({ lfm: root + LFM.dir, granite: root + GRANITE.dir, mini: root + MINI.dir, nano: root + NANO.dir })
  });
}

/**
 * The licence text each shipped model's licence requires to travel with a copy (Apache-2.0 asks for it), as pinned files. Digests and sizes come from the application that owns the catalogue
 * (its licence texts and the CDN's own copies); the mapping of text to tier is the owner's to check. These are NOT downloaded by an install: they are part of the closure and of a bundle, and
 * the verifier requires them only in release mode.
 */
const QWEN_LICENCE = { sha256: "bbedc3fda3305820b977265f01b8619d87570a6739de3a5582c3464840f1e57a", bytes: 11544 };
export const LICENCE_TEXTS = Object.freeze({
  default: QWEN_LICENCE, light: QWEN_LICENCE,
  granite: { sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30", bytes: 11358 },
  mini: { sha256: "28a2fed67185b8e3c2d628885575d87e27227caecc0081deadb15d78fbcaa026", bytes: 11844 },   // Granite 4.0-H 350M
  lfm: { sha256: "4d28ca14dedc0b3d0fcc2b3339f0e79931faa33874f3d24f522183a8fc70068c", bytes: 10574 },
  nano: { sha256: "da55c8f45fbbb5427f4770b8d602044baaa6426f94ac54593425ec2b1be9aed1", bytes: 11857 }   // SmolLM2-135M-Instruct
});
