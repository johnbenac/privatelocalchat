// The shipped catalogue, built from the shipped MANIFESTS through the generic createCatalog: the proof that the manifest path carries today's real data. Pure; the model root and
// the directory the app serves its compiled libraries from are passed in. The original entry (catalog.mjs) keeps its own, configuration-reading way and a test shows the two agree.
import { createCatalog, QWEN35_EXTRA_CONTEXT } from "./catalog-core.mjs";
import { shippedManifests } from "./manifest-shipped.mjs";
import { TIERS, TIER_ORDER, VARIANT_INFO, W, L, LFM, GRANITE, MINI, NANO, chooseWebllmVariant, LEGACY_WLLAMA_BUILD_ID } from "./catalog-tiers.mjs";

export function defaultCatalog({ root, libBase, label = "configured source", overridden = false, manifests = shippedManifests() } = {}) {
  if (typeof root !== "string" || typeof libBase !== "string") throw new TypeError("defaultCatalog needs root and libBase");
  const byTierVariant = (tier, variant) => manifests.find((m) => m.tierKey === tier && (variant === undefined || m.variant === variant));
  const wllamaDir = { light: L.dir, lfm: LFM.dir, granite: GRANITE.dir, mini: MINI.dir, nano: NANO.dir };
  const entries = {
    default: { key: "default", engine: "webllm", info: TIERS.default, defaultVariant: "q4f16_1",
      variants: Object.fromEntries(["q4f16_1", "q4f32_1"].map((v) => [v, { manifest: byTierVariant("default", v), variantInfo: VARIANT_INFO[v] }])),
      dir: (v) => W[v].repo.split("/").pop() + "/resolve/" + W[v].commit + "/" }
  };
  for (const k of ["light", "lfm", "granite", "mini", "nano"]) entries[k] = { key: k, engine: "wllama", info: TIERS[k], manifest: byTierVariant(k), dir: wllamaDir[k], context: k === "light" ? QWEN35_EXTRA_CONTEXT : {} };
  return createCatalog({
    id: "shipped", entries, loadOptions: { buildId: LEGACY_WLLAMA_BUILD_ID }, order: [...TIER_ORDER], defaultTier: "light", sources: { root, libBase, label, overridden }, chooseVariant: chooseWebllmVariant,
    ladder: [{ tier: "default", variant: "q4f16_1" }, { tier: "default", variant: "q4f32_1" }, { tier: "light" }, { id: "smaller-than-2b", notCatalogued: true }]
  });
}
