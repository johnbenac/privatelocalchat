// Import this first in a test that needs the site manifest the build writes into the page (window.SITE_LINKS), from the fixture site (tests/fixtures/site): a site that names itself, as a browser sees it.
import {readFileSync} from 'node:fs';
import {normalizedSiteLinks} from '../../chat/site/site-links.mjs';
globalThis.SITE_LINKS=normalizedSiteLinks(JSON.parse(readFileSync(new URL('../fixtures/site/site.json',import.meta.url),'utf8')));
