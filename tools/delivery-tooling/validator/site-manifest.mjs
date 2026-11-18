// The site-layer manifest validator, the rule "no layer means no address, feed or sitemap", and the check that every asset a page names exists (contract O165, board T736).
// Moved here from Private Local Chat (chat/site/site-links.mjs `checkSiteJson`, scripts/public-site.mjs `assertAssetsExist`, tests/run-kit.test.mjs). Parameterised by the manifest format and
// the page names, so another application can use it; the page GENERATOR (region markers, page templates) is not here and stays PLC's until a second application has pages.
// A build calls these; the shipped (browser) readers of a manifest stay in the application. No dependencies; Node 22.
//
//   a manifest:  { "format": "<format>", "pages": { "<page>": "/path/ or https://...", ... },
//                  "site": { "url": "https://example.org/", "socialImage": "/brand/card.png", "countsPageLoads": true } }
import {access, readdir, readFile} from 'node:fs/promises';
import path from 'node:path';

export const SITE_KEYS = Object.freeze(['url', 'socialImage', 'countsPageLoads']);
// an origin with a trailing slash, and a plain path to an image: nothing that could end an attribute or a string in a page head
export const validSiteUrl = (v) => typeof v === 'string' && v.length <= 200 && /^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/$/.test(v);
export const validImagePath = (v) => typeof v === 'string' && v.length <= 200 && /^\/[A-Za-z0-9._\/-]+$/.test(v) && !v.includes('..');
const isPath = (v) => /^\/(?!\/)[^\s\\]*$/.test(v);
const isHttps = (v) => /^https:\/\/[^\s/\\]+[^\s\\]*$/.test(v);
/** True for a value that may name a page: a same-host path or an absolute https address, of a sane length. */
export const validTarget = (v) => typeof v === 'string' && v.length > 0 && v.length <= 2000 && (isPath(v) || isHttps(v));

/**
 * The problems in a site manifest, for a build to refuse it with: unknown pages, invalid targets, a format this build does not read. Empty means fine.
 * options: { format (required), pages (required: the page names the application knows), siteKeys (default SITE_KEYS) }
 */
export function checkSiteManifest(raw, {format, pages, siteKeys = SITE_KEYS} = {}) {
  if (typeof format !== 'string' || !Array.isArray(pages)) throw new Error('checkSiteManifest needs the application\'s manifest format and page names');
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['the manifest must be an object.'];
  if (raw.format !== format) problems.push(`format must be "${format}".`);
  const given = raw.pages;
  if (!given || typeof given !== 'object' || Array.isArray(given)) { problems.push('pages must be an object.'); return problems; }
  for (const [name, target] of Object.entries(given)) {
    if (!pages.includes(name)) problems.push(`"${name}" is not a page this application knows (${pages.join(', ')}).`);
    else if (!validTarget(target)) problems.push(`pages.${name} must be a path on this host (starting with a single /) or an https:// address.`);
  }
  if (raw.site !== undefined) {
    const s = raw.site;
    if (!s || typeof s !== 'object' || Array.isArray(s)) problems.push('site must be an object.');
    else {
      for (const key of Object.keys(s)) if (!siteKeys.includes(key)) problems.push(`site: "${key}" is not a setting this application knows (${siteKeys.join(', ')}).`);
      if (!validSiteUrl(s.url)) problems.push('site.url must be the public address of the site: https://host/ with nothing after the slash.');
      if (s.socialImage !== undefined && !validImagePath(s.socialImage)) problems.push('site.socialImage must be a path to an image on that site, such as /brand/card.png.');
      if (s.countsPageLoads !== undefined && typeof s.countsPageLoads !== 'boolean') problems.push('site.countsPageLoads must be true or false.');
    }
  }
  return problems;
}

const ASSET = /\b(?:href|src)="(\/[^"#?]*\.(?:css|mjs|js|png|svg|ico|xml|webmanifest|json))"/g;
/** The assets a page names (same-host absolute paths) that are not in the output folder. */
export async function missingAssets(html, outDir) {
  const missing = [];
  for (const [, ref] of html.matchAll(ASSET)) { try { await access(path.join(outDir, ref)); } catch { if (!missing.includes(ref)) missing.push(ref); } }
  return missing;
}
/** Throws when a page names an asset that is not in the output (the build's own form of the check). */
export async function assertAssetsExist(html, outDir, label) {
  const [first] = await missingAssets(html, outDir);
  if (first) throw new Error(`${label} refers to ${first}, which is not in the build output`);
}

const ADDRESS_FILES = ['sitemap.xml', 'robots.txt', 'feed.xml', 'rss.xml', 'atom.xml', 'updates/rss.xml'];
const ADDRESS_IN_HTML = [[/<link\b[^>]*\brel\s*=\s*["']canonical["']/i, 'a canonical link'], [/<meta\b[^>]*\bproperty\s*=\s*["']og:url["']/i, 'an og:url'], [/<meta\b[^>]*\bproperty\s*=\s*["']og:image["']/i, 'an og:image'],
  [/<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i, 'structured data']];
async function* htmlFiles(dir, root = dir) {
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(full, root); else if (/\.html?$/i.test(e.name)) yield path.relative(root, full).split(path.sep).join('/');
  }
}
/**
 * "No layer means no address": a build made without a site manifest that has a public address (site.url) must not carry a sitemap, robots.txt, a feed, a canonical link,
 * Open Graph address or image, or structured data. Returns the problems. Pass hasSiteAddress=true for a site build, which may have them (the function then returns nothing).
 */
export async function noAddressWithoutManifest(outDir, {hasSiteAddress = false, extraFiles = []} = {}) {
  if (hasSiteAddress) return [];
  const problems = [];
  for (const rel of [...ADDRESS_FILES, ...extraFiles]) { try { await access(path.join(outDir, rel)); problems.push(`${rel} exists, but this build has no site address`); } catch { /* absent: good */ } }
  for await (const rel of htmlFiles(outDir)) {
    const html = await readFile(path.join(outDir, rel), 'utf8');
    for (const [re, what] of ADDRESS_IN_HTML) if (re.test(html)) problems.push(`${rel} carries ${what}, but this build has no site address`);
  }
  return problems;
}
