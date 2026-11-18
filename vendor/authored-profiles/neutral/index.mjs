/** Entry point 3: the neutral entry. Open and validate an authored bundle (`openAuthored`) and make a plain
 * preset {id,name,prompt} from a character's text (`projectPLCPreset`), for consumers that must carry nothing of
 * other projects. Its whole import closure (scripts/neutral-closure.mjs) contains no receiver projection, no
 * receiver aspect definition and no web address. Pure. It validates the neutral aspect definitions only. */
import {CONTENT_SCHEMA} from '../src/core/content-schema.neutral.mjs';
import {createContentEngine} from '../src/core/content-engine.mjs';
import {createBundleEngine} from '../src/core/bundle-engine.mjs';
import {createProjectionKit} from '../src/core/projection-kit.mjs';
import {createPLCProjection} from '../src/core/plc-projection.mjs';
import {createAuthoredEngine} from '../authored-profiles/authored-engine.mjs';
import {DEFINITIONS} from '../authored-profiles/definitions.mjs';

// The same engines as the main entry, bound to the schema without its `$schema` annotation. A registry whose
// schema is otherwise the same, with the annotation, is accepted, so the package's bundles open unchanged.
const content = createContentEngine(CONTENT_SCHEMA, {ignoreDialect: true});
const bundles = createBundleEngine(content);
const {LIMITS, parseDefinitions, loadRegistry, validateAuthored, openAuthored} =
  createAuthoredEngine({content, bundles});
const {projectPLCPreset} = createPLCProjection(createProjectionKit(content.validateContent));

export {LIMITS, DEFINITIONS, parseDefinitions, loadRegistry, validateAuthored, openAuthored, projectPLCPreset};
