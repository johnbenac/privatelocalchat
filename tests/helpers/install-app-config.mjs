// Import this first in a test that loads code which asks for the model sources at load time: it installs what the build writes into the page (window.APP_CONFIG),
// from the shipped defaults, so a test sees the app as a browser does.
import {readFileSync} from 'node:fs';
import {buildAppConfig} from '../../runtime/config/app-config.mjs';
globalThis.APP_CONFIG=buildAppConfig(JSON.parse(readFileSync(new URL('../../app-config.json',import.meta.url),'utf8')));
