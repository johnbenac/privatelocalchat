// The package's own catalogue made from its own manifests: the data lives here, behind its own entry, so runtime.mjs stays free of it.
//   import { defaultCatalog, shippedManifests } from "./shipped.mjs";
export { defaultCatalog } from "./catalog-default.mjs";
export { shippedManifests } from "./manifest-shipped.mjs";
