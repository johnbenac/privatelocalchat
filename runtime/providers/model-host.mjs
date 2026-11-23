// The ModelHost as the ORIGINAL entry has always exposed it: createModelHost with the original catalogue (read from the page's configuration, window.APP_CONFIG) as its default.
// The implementation is model-host-core.mjs, which takes any catalogue; runtime.mjs exports that one, for a consumer with its own catalogue and no window global to read.
import { createModelHost as createModelHostWith } from "./model-host-core.mjs";
import { legacyCatalog } from "./catalog.mjs";

export function createModelHost(options = {}) {
  return createModelHostWith({ catalog: legacyCatalog(), ...options });
}
