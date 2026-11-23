// A catalogue made from MANIFESTS: the object createModelHost takes as `catalog`. Pure: it reads no configuration, no window global and nothing at import.
//
//   const catalog = createCatalog({ id, entries: { light: { key, engine: "wllama", info, manifest, dir }, ... }, order, defaultTier, sources: { root, libBase } });
//
// An entry is {key, engine, info, manifest | variants, dir, ...}:
//   key       the TIER KEY a person's saved choice stores ("default", "light"): distinct from the manifest id, so a manifest can be renamed or replaced without losing anyone's choice
//   info      the free passthrough that reaches state.tiers[key].info unchanged (label, family, paramsB, structured modes, speed, strengths, context window...)
//   manifest  {descriptor, view} (manifest-view.mjs); or `variants: {variantKey: {manifest, variantInfo}}` with `defaultVariant` for a model that comes in builds (the two WebLLM builds)
//   dir       where under the source root this entry's files live: a string, or (variantKey) => string
// Nothing here names a host: the host comes from `sources.root` (and `sources.libBase` for runtime-role artifacts such as the compiled WebLLM library).
import { webllmLoadConfig, wllamaLoadConfig, QWEN35_EXTRA_CONTEXT } from "./engine-config.mjs";

const DEFAULT_REASON = "The smaller Qwen3.5-2B model is the starting choice. Select the quality model if this device supports it.";
const slash = (v) => (v.endsWith("/") ? v : v + "/");

const ABSOLUTE = /^([a-z][a-z0-9+.-]*:)?\/\/|^\//i;   // an https address, a protocol-relative address or a path on this host: never prefixed with a root
const originOf = (u) => /^https?:\/\/[^/]+/i.exec(String(u))?.[0] ?? "this host";

/**
 * options: id, entries, order, defaultTier, texts, sources {root, libBase, label?}, chooseVariant(env), ladder, extraContext, settingsKey, ladderStartTier, and
 *   loadOptions {buildId, nBatch?, nUbatch?}  data the wllama load config needs (an entry may carry its own `loadOptions`)
 *   resolveSources(overrides)                 the consumer's own: how an override of the sources is read, labelled and checked (default: root and libBase only; unknown keys are refused)
 */
export function createCatalog({ id = "catalog", entries, order = Object.keys(entries), defaultTier = order[0], texts = {}, sources = null, chooseVariant = null, ladder = [], extraContext = {}, loadOptions = {}, resolveSources: ownResolveSources = null, settingsKey = null, ladderStartTier = null } = {}) {
  if (!entries || typeof entries !== "object") throw new TypeError("createCatalog needs entries");
  for (const k of order) if (!entries[k]) throw new RangeError(`order names ${k}, which has no entry`);
  if (!order.includes(defaultTier)) throw new RangeError(`the default tier ${defaultTier} is not in the order`);
  const tiers = Object.freeze(Object.fromEntries(order.map((k) => [k, entries[k].info])));
  const variantInfo = {}; let defaultVariant = null;
  for (const k of order) { const e = entries[k]; if (e.variants) { for (const [vk, v] of Object.entries(e.variants)) variantInfo[vk] = v.variantInfo; defaultVariant ??= e.defaultVariant ?? Object.keys(e.variants)[0]; } }
  const manifestOf = (tier, variant) => {
    const e = entries[tier]; if (!e) throw new RangeError(`unknown tier ${tier}`);
    if (!e.variants) return e.manifest;
    const vk = variant ?? e.defaultVariant; const v = e.variants[vk]; if (!v) throw new RangeError(`unknown build ${vk}`);
    return v.manifest;
  };
  const dirOf = (tier, variant) => { const e = entries[tier]; const d = typeof e.dir === "function" ? e.dir(variant ?? e.defaultVariant) : (e.dir ?? ""); return d ? slash(d) : ""; };
  // where an entry's files live: its own `base` (so one catalogue can draw from more than one host), else the sources' root, plus the entry's directory; a directory that is already absolute
  // (an https address, or a path on this host) stands on its own and is never prefixed with a root
  const placeOf = (e, srcs, tier, variant) => { const d = dirOf(tier, variant); if (d && ABSOLUTE.test(d)) return d; return slash(e.base ?? srcs.root) + d; };
  const filesOf = (tier, srcs, variant) => {
    const m = manifestOf(tier, variant); const byName = new Map(m.descriptor.artifacts.map((a) => [a.name, a]));
    return m.view.files.filter((f) => f.role !== "licence").map((f) => { const a = byName.get(f.name); const base = f.role === "runtime" ? slash(typeof srcs.libBase === "object" && srcs.libBase !== null ? srcs.libBase[variant ?? entries[tier].defaultVariant] : srcs.libBase) : placeOf(entries[tier], srcs, tier, variant); return { path: f.name, bytes: a.bytes, sha256: a.sha256, url: base + f.name, scope: f.scope }; });
  };
  const api = {
    id, tiers, order: Object.freeze([...order]), defaultTier, ...(settingsKey ? { settingsKey } : {}), ...(ladderStartTier ? { ladderStartTier } : {}), variantInfo: Object.freeze(variantInfo), defaultVariant, ladder: Object.freeze([...ladder]),
    texts: { defaultReason: texts.defaultReason ?? DEFAULT_REASON, reasonFor: texts.reasonFor ?? null, notice: texts.notice ?? null },
    chooseVariant: (env) => (chooseVariant ? chooseVariant(env) : null),
    /** The info of a tier once a build is chosen (the model id, quantization, size and memory of that build), as the default tier's info gets rewritten when the GPU is probed. */
    applyVariant(tier, info, variant) {
      const v = entries[tier]?.variants?.[variant]; if (!v) return info;
      return { ...info, modelId: v.variantInfo.modelId, quantization: variant, downloadBytes: v.variantInfo.downloadBytes, memory: v.variantInfo.memory };
    },
    /** A file's place under ANY source's base (the entry's directory plus its name), or null when it has none (a runtime file, an entry with its own host, an absolute directory): such a file comes only from its own address. */
    relFor(tier, file, variant) { const e = entries[tier]; const d = dirOf(tier, variant); if (!e || file.scope === "webllm/wasm" || e.base !== undefined || (d && ABSOLUTE.test(d))) return null; return d + file.path; },
    /** Where a file sits in a BUNDLE (a picked folder or a tar built by the offline builder): the manifest id's last segment as the model's directory, then the artifact's name (resource:model/qwen3.5-2b-q4-0 -> qwen3.5-2b-q4-0/<name>). Independent of the catalogue's own directory, which is the canonical address. */
    bundleRelFor(tier, file, variant) { const id = manifestOf(tier, variant)?.descriptor?.resource?.id; return typeof id === "string" && file.scope !== "webllm/wasm" ? id.slice(id.lastIndexOf("/") + 1) + "/" + file.path : null; },
    runsOnProcessor: (tier) => entries[tier]?.engine === "wllama" || entries[tier]?.runsOnProcessor === true,
    resolveSources(overrides = null) {
      if (ownResolveSources) return ownResolveSources(overrides, sources);
      if (!sources) throw new Error("this catalogue was made without sources: pass `sources: {root, libBase}`, or its own resolveSources");
      if (!overrides) return { sources: { ...sources }, label: sources.label ?? "configured source", overridden: Boolean(sources.overridden) };
      for (const k of Object.keys(overrides)) if (!["root", "libBase"].includes(k)) throw new RangeError(`unknown source override ${k}: this catalogue reads root and libBase (give the catalogue its own resolveSources for other keys)`);
      const next = { ...sources, ...overrides };
      return { sources: next, label: "OVERRIDE: " + originOf(next.root) + (next.libBase !== sources.libBase ? " (libraries: " + originOf(next.libBase) + ")" : ""), overridden: true };
    },
    tierFiles(tier, srcs, variant) { return filesOf(tier, srcs, variant); },
    loadConfigFor(tier, { sources: srcs, runtimeDir = null, variant, backend = "gpu" } = {}) {
      const e = entries[tier]; if (!e) throw new RangeError(`unknown tier ${tier}`);
      // an engine the package has no builder for brings its own: loadConfig({tier, info, files, sources, runtimeDir, variant, backend}) -> the config its adapter takes
      if (typeof e.loadConfig === "function") return e.loadConfig({ tier, info: e.info, files: filesOf(tier, srcs, variant), sources: srcs, runtimeDir, variant, backend });
      if (e.engine === "webllm") {
        const vk = variant ?? e.defaultVariant; const files = filesOf(tier, srcs, vk); const lib = files.find((f) => f.scope === "webllm/wasm");
        return webllmLoadConfig({ tier, variant: vk, variantInfo: e.variants[vk].variantInfo, info: e.info, files, modelBase: placeOf(e, srcs, tier, vk), modelLib: lib.url });
      }
      if (e.engine === "wllama") { const o = { ...loadOptions, ...(e.loadOptions ?? {}) }; return wllamaLoadConfig({ tier, info: e.info, files: filesOf(tier, srcs, variant), runtimeDir, backend, buildId: o.buildId, nBatch: o.nBatch, nUbatch: o.nUbatch, extraContext: { ...(e.context ?? {}), ...(extraContext[tier] ?? {}) } }); }
      throw new RangeError(`tier ${tier}: no load config for engine ${e.engine}; register a builder`);
    }
  };
  return Object.freeze(api);
}

export { QWEN35_EXTRA_CONTEXT };
