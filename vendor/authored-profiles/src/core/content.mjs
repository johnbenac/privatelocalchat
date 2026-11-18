/** Data-only content contract, bound to the published core envelope schema. No I/O, credential access,
 * model execution or state writes. The code is src/core/content-engine.mjs. */
import {CONTENT_SCHEMA} from './content-schema.mjs';
import {createContentEngine} from './content-engine.mjs';
export {CONTENT_SCHEMA};
export const {CONTENT_FORMAT, REGISTRY_FORMAT, ContentError, checkJSON, validateSchema, createRegistry, registerDefinitions, validateContent, validateContentRecords, validateContentRecordChanges, parseContent, parseContentJSON} =
  createContentEngine(CONTENT_SCHEMA);
