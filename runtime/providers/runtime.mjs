// The additive entry of model-runtime 1.1: everything a consumer needs to plug in its own engines, hooks and services, and nothing
// that reads a window global when imported. (index.mjs, the original entry, still exports the catalogue, which does.)
//
//   import { createEngineRegistry, defaultRegistry, startHostWorker, createProvider, explainSupport, REASON_CODES } from "./runtime.mjs";
export { createEngineRegistry, defaultRegistry, createWorkerEngine, explainSupport, acquirePageHost, REASON_CODES, ENGINE_KINDS } from "./registry.mjs";
export { startHostWorker } from "./worker-entry.mjs";
export { createHost, serve } from "./host-core.mjs";
export { createProvider, openPort } from "./client.mjs";
export { classifyEngineError, hostDiedError, toProviderErrorFields, parseOverflow, estimateTokens, ERROR_CLASSES } from "./errors.mjs";
export { compareInventory, planInstall, createRateTracker } from "./verify.mjs";
export { judgeStructured, extractJson, validateSchema } from "./structured.mjs";
// the page host over ANY catalogue, and the catalogues made from manifests (nothing here reads a window global, and nothing here loads the package's own tier data: shipped.mjs does)
export { createModelHost } from "./model-host-core.mjs";
export { createCatalog } from "./catalog-core.mjs";
export { manifestFromDescriptor, termsFromRights, wllamaRuntimeManifest, rightsForLicence, REVIEWED_LICENCES } from "./manifest-view.mjs";
