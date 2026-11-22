// Accepted T15 semantic contracts, copied as data; tests verify against the actual sources.
// Composed from per-target data (receiving/), so a consumer that carries one target imports only that target's file.
import {CORE_ASPECTS, CORE_PROFILES} from './receiving/core.mjs';
import {PLC_ASPECTS} from './receiving/plc.mjs';
import {SONALON_ASPECTS} from './receiving/sonalon.mjs';

const ORDER = ['core:identity', 'core:dossier', 'core:communication', 'core:voice', 'sonalon:design-metadata',
  'sonalon:authored-sections', 'sonalon:voice-sections', 'sonalon:start'];
const pool = new Map([...CORE_ASPECTS, ...PLC_ASPECTS, ...SONALON_ASPECTS].map(d => [d.id, d]));
export const RECEIVING_DEFINITIONS = {aspectDefinitions: ORDER.map(id => pool.get(id)), profiles: CORE_PROFILES};
