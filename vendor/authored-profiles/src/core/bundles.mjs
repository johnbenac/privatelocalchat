/** Portable content bundles, bound to the published content engine. Pure records/bytes; no storage
 * publication, network or credentials. The code is src/core/bundle-engine.mjs. */
import * as content from './content.mjs';
import {createBundleEngine} from './bundle-engine.mjs';
export const {BUNDLE_FORMAT, DEFAULT_BUNDLE_LIMITS, BundleError, validatePortableContent, selectContent, sha256Bytes, exportBundle, importBundle, parseBundle} =
  createBundleEngine(content);
