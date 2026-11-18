/** Entry point 1: the content-bundle consumer (cosmogenitor/content/0 and cosmogenitor/bundle/0). Pure. */
export {CONTENT_FORMAT, REGISTRY_FORMAT, ContentError, checkJSON, validateSchema, createRegistry,
  registerDefinitions, validateContent, validateContentRecords, validateContentRecordChanges,
  parseContent, parseContentJSON} from './src/core/content.mjs';
export {CONTENT_SCHEMA} from './src/core/content-schema.mjs';
export {BUNDLE_FORMAT, DEFAULT_BUNDLE_LIMITS, BundleError, validatePortableContent, selectContent,
  sha256Bytes, exportBundle, importBundle, parseBundle} from './src/core/bundles.mjs';
export {projectPLCPreset, projectSonalonDesign, projectSonalonPlace} from './src/core/consumer-projections.mjs';
