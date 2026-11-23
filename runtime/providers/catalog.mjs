// The model catalogue as the ORIGINAL entry has always exposed it: two builds of the default model plus the small ones, with their sources read from the page's configuration.
// The tiers, pins and the functions that make files and load configs are in catalog-tiers.mjs (pure: they read no configuration). This file adds the configured model source
// (runtime/providers/app-config.mjs, docs/APP-CONFIG.md): a root that holds <name>/<revision>/<files>. A test may point a tier at another origin with `resolveSources(overrides)`:
// that is an explicit, visible setting (the manager shows "source: override <origin>"), never a fallback. Every file is checked against the pin.
import { appConfig } from "./app-config.mjs";
import * as pure from "./catalog-tiers.mjs";
import { W, L, LFM, GRANITE, MINI, NANO, WEBLLM_VARIANTS, DEFAULT_VARIANT } from "./catalog-tiers.mjs";

export { TIERS, TIER_ORDER, VARIANT_INFO, DEFAULT_VARIANT, WEBLLM_VARIANTS, WLLAMA_TIERS, TINY_TIERS, isTinyTier, isWllamaTier, chooseWebllmVariant } from "./catalog-tiers.mjs";

const CONFIG = appConfig();
// the origin of an address ("" for a path on this host), without naming any host
const originOf = (u) => /^https:\/\/[^/]+/.exec(String(u))?.[0] ?? "";
const ROOT = CONFIG.modelRoot();
// The 9B model's WebLLM builds are laid out like the Hugging Face repositories they were copied from: <name>/resolve/<revision>/, which WebLLM requires. The weights and config are data and come from the model root.
const webllmDir = (v) => ROOT + W[v].repo.split("/").pop() + "/resolve/" + W[v].commit + "/";
// The compiled model library (.wasm) is code, not data: the app serves it itself, from its own release folder (runtime/providers/vendor/webllm/libs/, pinned), never from the model root.
// A shared data-only CDN holds no executable files (T587). The address is resolved against this module, so it follows the release the page started on.
const webllmLibDir = new URL("./vendor/webllm/libs/", import.meta.url).href;
export const OFFICIAL_SOURCES = Object.freeze({
  webllmModelBase: Object.freeze(Object.fromEntries(WEBLLM_VARIANTS.map((v) => [v, webllmDir(v)]))),
  webllmLibBase: Object.freeze(Object.fromEntries(WEBLLM_VARIANTS.map((v) => [v, webllmLibDir]))),
  // Qwen/Qwen3.5-2B (Apache-2.0) as Q4_0 GGUF shards
  wllamaModelBase: ROOT + L.dir,
  // the other wllama models, pinned file by file
  wllamaTierBase: Object.freeze({ lfm: ROOT + LFM.dir, granite: ROOT + GRANITE.dir, mini: ROOT + MINI.dir, nano: ROOT + NANO.dir })
});
/** The configured source this copy uses, for the manager and the Settings row. */
export const MODEL_SOURCE = Object.freeze({ ...(CONFIG.activeSource() || {}), root: ROOT, shipped: CONFIG.isDefaultSource() });

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
  // the library is served by the app itself, so it names no origin unless a test moved it
  const libs = overrides.webllmLibBase ? Object.values(sources.webllmLibBase) : [];
  const flat = [...Object.values(sources.webllmModelBase), ...libs, sources.wllamaModelBase, ...Object.values(sources.wllamaTierBase)];
  const origins = [...new Set(flat.map((u) => originOf(u) || "this host").filter((o) => o !== (originOf(ROOT) || "this host")))];
  return { sources, label: "OVERRIDE: " + origins.join(", "), overridden: true };
}

/** The files that make up a tier (for the default tier, one build of it), with the URL each is fetched from, the cache scope and expected size/hash. */
export function tierFiles(tier, sources = OFFICIAL_SOURCES, variant = DEFAULT_VARIANT) { return pure.tierFiles(tier, sources, variant); }

/** The `load` config the host Worker's adapters take. `runtimeDir` is where the app serves the vendored wllama build (same origin). */
export function loadConfigFor(tier, { sources = OFFICIAL_SOURCES, runtimeDir = null, variant = DEFAULT_VARIANT, backend = "gpu" } = {}) { return pure.loadConfigFor(tier, { sources, runtimeDir, variant, backend }); }

/** The original catalogue as the object createModelHost takes (the same shape catalog-core.mjs makes from manifests), read from the page's configuration. */
export function legacyCatalog() {
  return Object.freeze({
    id: "legacy", tiers: pure.TIERS, order: pure.TIER_ORDER, defaultTier: "light", variantInfo: pure.VARIANT_INFO, defaultVariant: pure.DEFAULT_VARIANT,
    ladder: Object.freeze([{ tier: "default", variant: "q4f16_1" }, { tier: "default", variant: "q4f32_1" }, { tier: "light" }, { id: "smaller-than-2b", notCatalogued: true }]),
    settingsKey: "plc.models.v1", ladderStartTier: "light",
    texts: { defaultReason: "The smaller Qwen3.5-2B model is the starting choice. Select the quality model if this device supports it.", reasonFor: (tier, at) => { const when = at ? ` on ${new Date(at).toLocaleString()}` : ""; if (tier === "light") return `Light tier, chosen by you${when}. It uses less memory than the quality model.`; if (tier === "default") return `Quality tier, chosen by you${when}.`; return null; } },
    chooseVariant: pure.chooseWebllmVariant,
    applyVariant: (tier, info, v) => (tier === "default" && info.engine === "webllm" ? { ...info, modelId: pure.VARIANT_INFO[v].modelId, quantization: v, downloadBytes: pure.VARIANT_INFO[v].downloadBytes, memory: pure.VARIANT_INFO[v].memory } : info),
    runsOnProcessor: pure.isWllamaTier, resolveSources, tierFiles, loadConfigFor
  });
}
