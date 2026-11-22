/** Entry point 4: the neutral rich entry for ONE receiver, Private Local Chat. Everything the neutral entry gives
 * (`openAuthored`, `LIMITS`, `projectPLCPreset`, the neutral definitions) plus `receivingFixture` for the target `plc`:
 * the receiving check of a whole authored package and its plain preset, bounded by PLC's provisional limits. Its import
 * closure (scripts/neutral-closure.mjs neutral/rich.mjs) holds no other receiver's projection or receiving data and no web
 * address; any other target name is refused as unknown. Pure. */
import {CONTENT_SCHEMA} from '../src/core/content-schema.neutral.mjs';
import {createContentEngine} from '../src/core/content-engine.mjs';
import {createBundleEngine} from '../src/core/bundle-engine.mjs';
import {createProjectionKit} from '../src/core/projection-kit.mjs';
import {createPLCProjection} from '../src/core/plc-projection.mjs';
import {createAuthoredEngine} from '../authored-profiles/authored-engine.mjs';
import {createReceiving} from '../authored-profiles/receiving-engine.mjs';
import {plcTarget, PLC_PROVISIONAL_LIMITS} from '../authored-profiles/receiving/plc-bounds.mjs';
import {CORE_ASPECTS, CORE_PROFILES} from '../authored-profiles/receiving/core.mjs';
import {PLC_ASPECTS, PLC_CONSUMED} from '../authored-profiles/receiving/plc.mjs';
import {DEFINITIONS} from '../authored-profiles/definitions.mjs';

const content = createContentEngine(CONTENT_SCHEMA, {ignoreDialect: true});
const bundles = createBundleEngine(content);
const authored = createAuthoredEngine({content, bundles});
const {LIMITS, parseDefinitions, loadRegistry, validateAuthored, openAuthored, requireValid, fail} = authored;
const {projectPLCPreset} = createPLCProjection(createProjectionKit(content.validateContent));
// Only the definitions PLC consumes, in the order the full entry lists them.
const byId = new Map([...CORE_ASPECTS, ...PLC_ASPECTS].map(d => [d.id, d]));
const definitions = Object.freeze({aspectDefinitions: Object.freeze(PLC_CONSUMED.map(id => byId.get(id))), profiles: CORE_PROFILES});
const {receivingFixture} = createReceiving({
  authored: {openAuthored, requireValid, fail}, content, definitions,
  targets: {plc: plcTarget({projectPLCPreset, consumed: PLC_CONSUMED})}
});

export {LIMITS, PLC_PROVISIONAL_LIMITS, DEFINITIONS, parseDefinitions, loadRegistry, validateAuthored, openAuthored, receivingFixture, projectPLCPreset};
