// The model catalogue: two tiers, their official sources, licences, sizes and the exact files each one is made of.
// Decision row 65 (plan/DECISIONS.md): default = WebLLM + Qwen3.5-9B (q4f16_1 where the GPU has shader-f16, q4f32_1 where it does not,
// chosen by the capability probe, not by device class); light = wllama retained-v1q + Qwen3.5-2B Q4_0. No other model is offered.
//
// Where the files come from is the configured model source (runtime/config/app-config.mjs, docs/APP-CONFIG.md): a root that holds <name>/<revision>/<files>. A test may point a tier at another
// origin with `resolveSources(overrides)`: that is an explicit, visible setting (the manager shows "source: override <origin>"), never a fallback. Every file is checked against the pin here.
import { CATALOG_DATA } from "./catalog-data.mjs";
import { appConfig } from "../config/app-config.mjs";

const MiB = 1 << 20;
const W = CATALOG_DATA.webllmQwen35_9b;
const L = CATALOG_DATA.wllamaQwen35_2b;
const LFM = CATALOG_DATA.wllamaLfm25_2_6b;
const GRANITE = CATALOG_DATA.wllamaGranite40h1b;
const MINI = CATALOG_DATA.wllamaGranite40h350m;
const NANO = CATALOG_DATA.wllamaSmolLM2_135m;
const WLLAMA_DATA = Object.freeze({ light: L, lfm: LFM, granite: GRANITE, mini: MINI, nano: NANO });
/** Tiers served by the wllama engine (llama.cpp in WebAssembly): they share the runtime, the OPFS cache and the processor fallback. */
export const WLLAMA_TIERS = Object.freeze(["light", "lfm", "granite", "mini", "nano"]);
/** The tiny models (a few hundred megabytes in memory at most): small enough for a phone with little free storage, and for iPhone and iPad on the processor. */
export const TINY_TIERS = Object.freeze(["mini", "nano"]);
export const isTinyTier = (t) => TINY_TIERS.includes(t);
export const isWllamaTier = (t) => WLLAMA_TIERS.includes(t);

/** The WebLLM builds of the default model. f16 is preferred; f32 exists for GPUs without shader-f16. */
export const WEBLLM_VARIANTS = Object.freeze(["q4f16_1", "q4f32_1"]);
export const DEFAULT_VARIANT = "q4f16_1";

const CONFIG = appConfig();
// the origin of an address ("" for a path on this host), without naming a host of our own
const originOf = (u) => /^https:\/\/[^/]+/.exec(String(u))?.[0] ?? "";
const ROOT = CONFIG.modelRoot();
// The 9B model's WebLLM builds are laid out like the Hugging Face repositories they were copied from: <name>/resolve/<revision>/, which WebLLM requires. The model and its library share a folder.
const webllmDir = (v) => ROOT + W[v].repo.split("/").pop() + "/resolve/" + W[v].commit + "/";
export const OFFICIAL_SOURCES = Object.freeze({
  webllmModelBase: Object.freeze(Object.fromEntries(WEBLLM_VARIANTS.map((v) => [v, webllmDir(v)]))),
  webllmLibBase: Object.freeze(Object.fromEntries(WEBLLM_VARIANTS.map((v) => [v, webllmDir(v)]))),
  // Qwen/Qwen3.5-2B (Apache-2.0) as Q4_0 GGUF shards
  wllamaModelBase: ROOT + L.dir,
  // the other wllama models, pinned file by file
  wllamaTierBase: Object.freeze({ lfm: ROOT + LFM.dir, granite: ROOT + GRANITE.dir, mini: ROOT + MINI.dir, nano: ROOT + NANO.dir })
});
/** The configured source this copy uses, for the manager and the Settings row. */
export const MODEL_SOURCE = Object.freeze({ ...(CONFIG.activeSource() || {}), root: ROOT, shipped: CONFIG.isDefaultSource() });

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

const perVariant = (v) => (typeof v === "string" ? Object.fromEntries(WEBLLM_VARIANTS.map((q) => [q, v.endsWith("/") ? v : v + "/"])) : Object.fromEntries(WEBLLM_VARIANTS.map((q) => [q, v[q] ? (v[q].endsWith("/") ? v[q] : v[q] + "/") : OFFICIAL_SOURCES.webllmModelBase[q]])));

/** Merge explicit overrides over the official sources. Returns { sources, label } where label is shown to the human.
 *  webllmModelBase / webllmLibBase may be a string (the same URL for both builds; valid only if that place serves the build in use)
 *  or { q4f16_1, q4f32_1 }. */
export function resolveSources(overrides = null) {
  if (!overrides) return { sources: { ...OFFICIAL_SOURCES }, label: MODEL_SOURCE.shipped ? MODEL_SOURCE.label : "OVERRIDE: " + (originOf(ROOT) || "this host"), overridden: !MODEL_SOURCE.shipped };
  const sources = { ...OFFICIAL_SOURCES };
  if (overrides.webllmModelBase) sources.webllmModelBase = perVariant(overrides.webllmModelBase);
  if (overrides.webllmLibBase) sources.webllmLibBase = perVariant(overrides.webllmLibBase);
  if (overrides.wllamaModelBase) sources.wllamaModelBase = overrides.wllamaModelBase.endsWith("/") ? overrides.wllamaModelBase : overrides.wllamaModelBase + "/";
  if (overrides.wllamaTierBase) sources.wllamaTierBase = Object.freeze(Object.fromEntries(Object.entries({ ...OFFICIAL_SOURCES.wllamaTierBase, ...overrides.wllamaTierBase }).map(([k, v]) => [k, v.endsWith("/") ? v : v + "/"])));
  // WebLLM rewrites a model URL that lacks /resolve/<rev>/ by appending resolve/main/, which would silently miss every cached file
  for (const v of WEBLLM_VARIANTS) if (!/.+\/resolve\/.+\//.test(sources.webllmModelBase[v])) throw new RangeError(`webllmModelBase.${v} must contain /resolve/<revision>/ (WebLLM would rewrite it otherwise): ${sources.webllmModelBase[v]}`);
  const flat = [...Object.values(sources.webllmModelBase), ...Object.values(sources.webllmLibBase), sources.wllamaModelBase, ...Object.values(sources.wllamaTierBase)];
  const origins = [...new Set(flat.map((u) => originOf(u) || "this host").filter((o) => o !== (originOf(ROOT) || "this host")))];
  return { sources, label: "OVERRIDE: " + origins.join(", "), overridden: true };
}

/** The files that make up a tier (for the default tier, one build of it), with the URL each is fetched from, the cache scope and expected size/hash. */
export function tierFiles(tier, sources = OFFICIAL_SOURCES, variant = DEFAULT_VARIANT) {
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
export function loadConfigFor(tier, { sources = OFFICIAL_SOURCES, runtimeDir = null, variant = DEFAULT_VARIANT, backend = "gpu" } = {}) {
  const t = TIERS[tier];
  if (!t) throw new RangeError(`unknown tier ${tier}`);
  if (tier === "default") {
    const vi = VARIANT_INFO[variant]; if (!vi) throw new RangeError(`unknown WebLLM build ${variant}`);
    return {
      adapter: "webllm", tier, variant, modelId: vi.modelId, modelBase: sources.webllmModelBase[variant], modelLib: sources.webllmLibBase[variant] + W[variant].lib.path,
      contextWindow: t.contextWindowTokens, quantization: vi.quantization, license: t.license, files: tierFiles("default", sources, variant)
    };
  }
  const files = tierFiles(tier, sources);
  // "cpu": the same model and files, computed by the processor through WebAssembly (no WebGPU at all). Slower, and it keeps the whole model
  // in WebAssembly memory instead of the graphics card, so nothing is offloaded.
  const cpu = backend === "cpu";
  return {
    adapter: "wllama", tier, backend: cpu ? "cpu" : "gpu", modelId: t.modelId, modelUrl: files[0].url, quantization: t.quantization, license: t.license, files,
    runtime: { dir: runtimeDir, buildId: "privatelocalchat-native-destroy-20261030-v1", cls: "compat" },
    context: {
      // Keep the full conversation window; bound temporary prefill graphs separately.
      // The non-flash-attention path used on iPhone otherwise reserves ~94 MiB at 512.
      n_ctx: t.contextWindowTokens, n_batch: 128, n_ubatch: 32, flash_attn_policy: -1, n_gpu_layers: cpu ? 0 : -1,
      // the fused gated-delta-net kernels are Qwen3.5's; the other models do not have that layer
      ...(tier === "light" ? { fused_gdn_auto: true, fused_gdn_ar: true, fused_gdn_ch: true } : {}),
      sched_max_splits_hint: 128, ctx_checkpoints: 1, checkpoint_every_n_tokens: 64, checkpoint_clear_policy: "replace-on-reset-and-terminate"
    },
    knobs: { initialMemoryMiB: 128, offloadTiedEmbedding: !cpu, progressiveSourceRelease: true, recycleWindowBytes: 96 * MiB }
  };
}
