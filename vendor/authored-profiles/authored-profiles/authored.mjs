/** Pure bounded authored contracts. All I/O and receiver admission belong to callers.
 * The validators are authored-engine.mjs bound to the published content and bundle modules; this module
 * adds the receiver projections (receivingFixture) and keeps the original exports. */
import * as content from '../src/core/content.mjs';
import * as bundles from '../src/core/bundles.mjs';
import {projectPLCPreset, projectSonalonDesign} from '../src/core/consumer-projections.mjs';
import {DEFINITIONS} from './definitions.mjs';
import {RECEIVING_DEFINITIONS} from './receiving-definitions.mjs';
import {createAuthoredEngine} from './authored-engine.mjs';
import {createReceiving} from './receiving-engine.mjs';
import {plcTarget, PLC_PROVISIONAL_LIMITS} from './receiving/plc-bounds.mjs';
import {PLC_CONSUMED} from './receiving/plc.mjs';
import {SONALON_CONSUMED} from './receiving/sonalon.mjs';

const {LIMITS, parseDefinitions, loadRegistry, validateAuthored, exportAuthored, openAuthored, requireValid, fail} =
  createAuthoredEngine({content, bundles});
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
freeze(RECEIVING_DEFINITIONS);
export {LIMITS, parseDefinitions, loadRegistry, validateAuthored, exportAuthored, openAuthored};

const {receivingFixture} = createReceiving({
  authored: {openAuthored, requireValid, fail}, content, definitions: RECEIVING_DEFINITIONS,
  targets: {
    plc: plcTarget({projectPLCPreset, consumed: PLC_CONSUMED}),
    sonalon: {consumed: SONALON_CONSUMED, routes: ['file'],
      project: (view, {subjectId, validate}) => projectSonalonDesign(view.document, view.registry,
        {subjectId, ...(validate ? {validate} : {})})}
  }
});
export {receivingFixture, PLC_PROVISIONAL_LIMITS};


export {DEFINITIONS};
