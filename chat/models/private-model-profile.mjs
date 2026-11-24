import { createCatalog } from "../../runtime/providers/catalog-core.mjs";
import { sha256OfBlob } from "../../runtime/providers/hash-blob.mjs";
import { manifestFromDescriptor, wllamaRuntimeManifest } from "../../runtime/providers/manifest-view.mjs";

const artifactName = "weights.gguf";

export async function preparePrivateGguf(file, { runtime, signal, id = crypto.randomUUID(), hash = sha256OfBlob }) {
  const header = new DataView(await file.slice(0, 24).arrayBuffer());
  if (header.byteLength < 24 || header.getUint32(0, false) !== 0x47475546 || ![2, 3].includes(header.getUint32(4, true))) {
    throw Object.assign(new Error("Select a GGUF version 2 or 3 model file."), { code:"unsupported-model-format" });
  }
  const sha256 = await hash(file, { signal });
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("The model checksum is invalid.");
  const pinnedRuntime = wllamaRuntimeManifest(runtime).descriptor;
  const manifest = manifestFromDescriptor({
    resource: {
      id: "resource:model/user-gguf-" + id,
      kind: "inert", class: "model-resource",
      revision: "gguf-v1",
      label: String(file.name || "User GGUF model").slice(0, 120),
    },
    artifacts: [{ name:artifactName, role:"weights", bytes:file.size, sha256, mediaType:"application/octet-stream" }],
    runtime: { engine:"wllama", version:"1" },
    dependencies: pinnedRuntime.artifacts.map(({ name, sha256, bytes }) => ({
      id:pinnedRuntime.resource.id, revision:pinnedRuntime.resource.revision,
      name, sha256, bytes, kind:"executable", role:name.replace(/\./g, "-"), need:"required",
    })),
  }, {
    needs:{ opfs:true },
    note:"User supplied. Not verified by Private Local Chat.",
  });
  return {
    manifest,
    provenance: { origin:"user-supplied", verifiedByPublisher:false, redistribution:"user-supplied-only" },
    source:{ id:"private-gguf-file", kind:"files", files:new Map([[artifactName, file]]) },
  };
}

export function readPrivateGguf(raw) {
  const manifest = JSON.parse(raw ?? "null");
  if (manifest === null) return null;
  const { resource, artifacts, runtime } = manifest?.descriptor ?? {};
  const [weight] = Array.isArray(artifacts) ? artifacts : [];
  if (!/^resource:model\/user-gguf-[a-z0-9-]{1,40}$/.test(resource?.id ?? "") ||
      resource.revision !== "gguf-v1" || typeof resource.label !== "string" || resource.label.length > 120 ||
      runtime?.engine !== "wllama" || runtime.version !== "1" || !Array.isArray(artifacts) || artifacts.length !== 1 ||
      weight?.name !== artifactName || weight.role !== "weights" || !/^[a-f0-9]{64}$/.test(weight.sha256) ||
      !Number.isSafeInteger(weight.bytes) || weight.bytes < 24) {
    throw new Error("The saved private GGUF registration is unreadable.");
  }
  return manifestFromDescriptor(manifest.descriptor, {
    needs:{ opfs:true },
    note:"User supplied. Not verified by Private Local Chat.",
  });
}

export function privateGgufCatalogOptions(manifest, { runtime, origin }) {
  const { resource, artifacts: [weights] } = manifest.descriptor;
  const tier = resource.id.split("/").at(-1);
  return {
    id: tier,
    defaultTier: tier,
    sources: {
      root: new URL("/__plc_private_models/", origin).href,
      libBase: new URL("../../runtime/providers/vendor/wllama/v1q/", import.meta.url).href,
      label: "User-supplied files",
    },
    loadOptions: { buildId: runtime.buildId },
    entries: {
      [tier]: {
        engine: "wllama",
        manifest,
        dir: weights.sha256 + "/",
        info: {
          label: resource.label,
          modelId: resource.id,
          engine: "wllama",
          adapter: "wllama",
          contextWindowTokens: 2048,
          downloadBytes: weights.bytes,
          memory: { steadyBytes: null, peakBytes: null },
          strengths: "User supplied. Not verified by Private Local Chat.",
          provenance: "user-supplied-unverified",
        },
      },
    },
  };
}

export function catalogWithPrivateGguf(shipped, manifest, options) {
  const privateCatalog = createCatalog(privateGgufCatalogOptions(manifest, options));
  const tier = privateCatalog.defaultTier;
  const { sources } = privateCatalog.resolveSources();
  if (shipped.tiers[tier]) throw new Error("The private model ID is already in use.");

  return {
    ...shipped,
    tiers: { ...shipped.tiers, [tier]: privateCatalog.tiers[tier] },
    order: [...shipped.order, tier],
    tierFiles(key, preferred, variant) {
      return key === tier ? privateCatalog.tierFiles(key, sources, variant) : shipped.tierFiles(key, preferred, variant);
    },
    loadConfigFor(key, config) {
      return key === tier ? privateCatalog.loadConfigFor(key, { ...config, sources, backend:"cpu" }) : shipped.loadConfigFor(key, config);
    },
    relFor(key, file, variant) {
      return key === tier ? null : shipped.relFor(key, file, variant);
    },
    bundleRelFor(key, file, variant) {
      return key === tier ? privateCatalog.bundleRelFor(key, file, variant) : shipped.bundleRelFor?.(key, file, variant);
    },
    runsOnProcessor(key) {
      return key === tier || shipped.runsOnProcessor(key);
    },
  };
}
