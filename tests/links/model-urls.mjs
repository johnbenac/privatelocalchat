// Every address the app can request for a model, a voice or the memory embedding set, with its size and SHA-256 pin (docs/PLAN, stage 4).
// Shared by scripts/model-urls-snapshot.mjs (records the baseline) and tests/model-urls.test.mjs (compares a build's addresses with it).
import '../helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import {fileURLToPath} from 'node:url';
export const BASELINE=fileURLToPath(new URL('../../docs/evidence/split/model-urls-baseline.json',import.meta.url));
// The enumeration is shipped code (it builds models.json), so it lives in scripts/models-manifest.mjs; this keeps the names the tests and the snapshot script use.
export {collectModelUrls} from '../../scripts/models-manifest.mjs';
